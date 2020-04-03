import { Shape, mountState } from "./../Shapes/shape";
import { AnimationOption } from '../option';
import { shapeContainer, ViewModel } from "./viewModel";
import { Util } from "../Common/util";
import { Text } from "../Shapes/text";
import { GlobalShape } from "./globalShape";
import * as zrender from './../lib/zrender.min';
import { Bound, BoundingRect } from "./boundingRect";
import { Animations } from "./animations";



export type zrenderShape = any;



/**
 * 渲染器
 */
export class Renderer {
    static zrender = zrender;
    // zrender实例
    private zr: any = null;
    // 视图管理器
    private viewModel: ViewModel;
    // 全局图形容器
    public globalShape: GlobalShape;
    // 配置项
    private option: AnimationOption;
    // 动画表
    private animations: Animations;
    // 需使用动画更新的zrender属性的队列
    private animatePropsQueue: {
        zrenderShape: zrenderShape,
        props: { [key: string]: any }
    }[] = [];
    // 需更新的zrender属性的队列
    private propsQueue: {
        zrenderShape: zrenderShape,
        props: { [key: string]: any }
    }[] = [];

    // HTML容器
    private container: HTMLElement;
    // 容器宽度
    private containerWidth: number;
    // 容器高度
    private containerHeight: number;
    // 视图真实水平中心
    private viewCenterX: number;
    // 视图真实垂直中心
    private viewCenterY: number;
    // 上一次更新是否被该次打断
    private isLastUpdateInterrupt: boolean = false;
    // 是否首次渲染
    private firstRender: boolean = true;

    constructor(container: HTMLElement, viewModel: ViewModel, opt: AnimationOption) {
        this.viewModel = viewModel;
        this.zr = Renderer.zrender.init(container);
        this.animations = new Animations(opt);
        this.globalShape = new GlobalShape(this);
        this.globalShape.setOrigin(container.offsetWidth / 2, container.offsetHeight / 2);
        this.option = opt;

        this.container = container;
        this.containerWidth = container.offsetWidth;
        this.containerHeight = container.offsetHeight;

        this.zr.add(this.globalShape.zrenderGroup);
    }

    /**
     * 设置zrender图形属性
     * @param zrenderShape
     * @param props
     * @param animation
     */
    setAttribute(zrenderShape, props, animation: boolean = false) {
        let queue = animation? this.animatePropsQueue: this.propsQueue;

        if(!this.option.enableAnimation) {
            queue = this.propsQueue;
        }

        let item = queue.find(item => zrenderShape.id === item.zrenderShape.id);

        if(!item) {
            queue.push({
                zrenderShape,
                props
            });
        }
        else {
            Util.extends(item.props, props);
        }
    }

    /**
     * 根据图形的mountState渲染zrender图形
     * @param shapeContainer 
     * @param removeList
     */
    renderZrenderShapes(shapeContainer: shapeContainer, removeList: Shape[]) {
        let shape: Shape, i;

        // 遍历shapeContainer中的图形
        Object.keys(shapeContainer).map(shapeList => {
            for(i = 0; i < shapeContainer[shapeList].length; i++) {
                shape = shapeContainer[shapeList][i];

                // 若图形状态为NEEDMOUNT，即需挂载
                if(shape.mountState === mountState.NEEDMOUNT) {
                    // 若zrender图形未创建，则创建zrender图形
                    if(shape.zrenderShape === null) {
                        shape.zrenderShape = shape.createZrenderShape();
                    }
                    else {
                        // 文本图形特殊处理
                        if(shape instanceof Text) {
                            shape.updateText(shape.zrenderShape);
                        }
                    }
                    // 将图形加入到全局图形容器
                    this.globalShape.add(shape);
                    // 设置叠层优先级
                    shape.zrenderShape.attr('z', shape.option.zIndex);
                    // 在图形加入容器后，设置为隐藏，为淡入淡出动画做铺垫
                    shape.updateZrenderShape('hide');
                    // 修改挂载状态为已挂载
                    shape.mountState = mountState.MOUNTED;
                    // 设置图形可见性
                    shape.visible = true;
                    shape.updateZrenderShape('show', true);
                }
            }
        });

        // 处理需要移除的图形
        removeList.length && removeList.map(shape => {
            // 若图形状态为NEEDUNMOUNT)，即需卸载
            if(shape.mountState === mountState.NEEDUNMOUNT) {
                // 修改挂载状态为已卸载
                shape.mountState = mountState.UNMOUNTED;
                // 设置图形可见性
                shape.visible = false;
                shape.updateZrenderShape('hide', true, (shape => {
                    return () => {
                        this.globalShape.remove(shape);
                        shape.zrenderShape = null;
                    }
                })(shape));
            }
        });
    }

    /**
     * 根据属性更新队列更新zrender图形
     */
    updateZrenderShapes(callback?: () => void) {
        // 遍历属性列表，直接修改属性
        if(this.propsQueue.length) {
            this.propsQueue.map(item => {
                Object.keys(item.props).map(prop => {
                    if(prop !== 'callback') {
                        item.zrenderShape.attr(prop, item.props[prop]);
                    }
                });

                // 执行回调
                item.props['callback'] && item.props['callback']();
            });

            this.propsQueue.length = 0;

            if(this.option.enableAnimation === false) {
                callback && callback();;
            }
        }

        setTimeout(() => {
            if(this.animatePropsQueue.length) {
                let queueLength = this.animatePropsQueue.length,
                    counter = 0;

                // 遍历动画属性列表，执行动画
                this.animatePropsQueue.map(item => {
                    item.zrenderShape.animateTo(
                        item.props, 
                        this.option.duration, 
                        this.option.timingFunction, 
                        () => {
                            counter++;

                            // 所有动画结束，触发afterUpadte回调事件
                            if(counter === queueLength && this.isLastUpdateInterrupt === false) {
                                callback && callback();
                                this.animatePropsQueue.length = 0;
                            }

                            item.props.callback && item.props.callback();
                        }
                    )
                });
            }
        }, 0);

        // 取消首次渲染的标志
        if(this.firstRender) {
            this.firstRender = false;
        }
    }

    /**
     * 跳过上一次更新的动画过程
     * @param callback 
     */
    skipUpdateZrenderShapes(callback?: () => void) {
        if(this.animatePropsQueue.length) {
            this.isLastUpdateInterrupt = true;

            // 遍历动画属性列表，执行动画
            this.animatePropsQueue.map(item => {
                item.zrenderShape.stopAnimation(true)
                item.props['callback'] && item.props['callback']();
            });

            // 所有动画结束，触发afterUpadte回调事件
            callback && callback();
            this.animatePropsQueue.length = 0;
            this.isLastUpdateInterrupt = false;
        }
    }

    /**
     * 根据动画名称，获取animations对象的对应动画属性
     * @param shape 
     * @param animationName 
     */
    getAnimationProps(shape: Shape, animationName: string) {
        return this.animations[animationName](shape);
    }

    /**
     * 获取全局容器图形
     */
    getGlobalShape(): GlobalShape {
        return this.globalShape;
    }

    /**
     * 获取容器宽度
     */
    getContainerWidth(): number {
        return this.containerWidth;
    }

    /**
     * 获取容器高度
     */
    getContainerHeight(): number {
        return this.containerHeight;
    }

    /**
     * 获取由所有图形组成的包围盒
     * @param shapes
     */
    getGlobalBound(shapesBound: boolean = true): BoundingRect {
        return shapesBound?
            Bound.union(...this.viewModel.getShapeList().map(item => item.getBound())):
            this.globalShape.getBound();
    }

    /**
     * 根据 translate 和 scale 调整视图
     * @param translate 
     * @param scale 
     */
    adjustGlobalShape(translate: [number, number] | 'auto', scale: [number, number] | 'auto') {
        let globalBound = this.getGlobalBound(),
            cx = globalBound.x + globalBound.width / 2,
            cy = globalBound.y + globalBound.height / 2;

        this.globalShape.setOrigin(cx, cy);

        if(translate !== undefined) {
            if(Array.isArray(translate)) {
                this.globalShape.translate(translate[0], translate[1], !this.firstRender);
            }

            if(translate === 'auto') {
                this.autoGlobalCenter(globalBound, !this.firstRender);
            }
        }

        if(scale !== undefined) {
            if(Array.isArray(scale)) {
                this.globalShape.scale(scale[0], scale[1], !this.firstRender);
            }

            if(scale === 'auto') {
                this.autoGlobalSize(globalBound, !this.firstRender);
            }
        }
    }

    /**
     * 重新整视图尺寸
     * @param translate
     * @param scale
     */
    resizeGlobalShape(translate: [number, number] | 'auto', scale: [number, number] | 'auto') {
        let oldWidth = this.containerWidth,
            oldHeight = this.containerHeight;

        this.containerWidth = this.container.offsetWidth;
        this.containerHeight = this.container.offsetHeight;

        this.zr.resize();

        let newTranslate = [
            this.containerWidth / 2 - oldWidth / 2,
            this.containerHeight / 2 - oldHeight / 2
        ];

        // 调整视图
        this.adjustGlobalShape(newTranslate as [number, number], scale);
        // 更新视图
        this.updateZrenderShapes();
    }

    /**
     * 调整视图至容器中央
     * @param bound
     * @param enableAnimation
     */
    autoGlobalCenter(bound: BoundingRect, enableAnimation: boolean = false) {
        let cx = bound.x + bound.width / 2,
            cy = bound.y + bound.height / 2,
            dx, dy;

        // 首次调整
        if(this.viewCenterX === undefined && this.viewCenterY === undefined) {
            dx = this.containerWidth / 2 - cx;
            dy = this.containerHeight / 2 - cy;
        }
        else {
            dx = this.viewCenterX - cx;
            dy = this.viewCenterY - cy;
        }

        this.globalShape.translate(dx, dy, enableAnimation);

        this.viewCenterX = cx;
        this.viewCenterY = cy;
    }

    /**
     * 调整视图使视图适应容器尺寸
     * @param bound
     * @param enableAnimation 
     */
    autoGlobalSize(bound: BoundingRect, enableAnimation: boolean = false) {
        // 如果现在视图尺寸小于容器大小，则不用调整
        if(bound.width < this.containerWidth && bound.height < this.containerHeight) {
            return;
        }

        let dWidth = bound.width - this.containerWidth,
            dHeight = bound.height - this.containerHeight,
            maxEdge, maxBoundEdge;

        if(dWidth > dHeight) {
            maxBoundEdge = bound.width;
            maxEdge = this.containerWidth;
        }
        else {
            maxBoundEdge = bound.height;
            maxEdge = this.containerHeight;
        }

        let scaleCoefficient = maxEdge / maxBoundEdge * 0.75;

        this.globalShape.scale(scaleCoefficient, scaleCoefficient, enableAnimation);
    }

    /**
     * 清空数据
     */
    clear() {
        this.animatePropsQueue.length = 0;
        this.propsQueue.length = 0;
        this.globalShape.clear();
    }
}