import { Interaction } from "./interaction";
import { BoundingRect } from "../View/boundingRect";
import { GlobalShape } from "../View/globalShape";



export class Move extends Interaction {
    private enableMove: boolean = false;
    private edgeOffsetX: number;
    private edgeOffsetY: number;

    private curX: number;
    private curY: number;
    private containerWidth: number;
    private containerHeight: number;

    private viewWindow: BoundingRect = {
        x: 0, y: 0, width: 0, height: 0
    };

    private moveType: { hor: boolean, ver: boolean } = { hor: false, ver: false };

    apply() {
        this.container.addEventListener('mousedown', mouseEvent => this.emitEvent('mouseDown', mouseEvent));
        this.container.addEventListener('mousemove', mouseEvent => this.emitEvent('mouseMove', mouseEvent));
        this.container.addEventListener('mouseup', () => this.emitEvent('reset'));
        this.container.addEventListener('mouseleave', () => this.emitEvent('reset'));
    }

    response(param) {
        let dx = 0, dy = 0,
            globalShape = this.renderer.getGlobalShape();

        if(this.moveType.hor) {
            dx = param.x - this.curX;
            this.viewWindow.x += dx;

            if(this.viewWindow.x > 0) {
                this.viewWindow.x = 0;
                dx = 0;
            }

            if(this.viewWindow.x < this.containerWidth - this.viewWindow.width) {
                this.viewWindow.x = this.containerWidth - this.viewWindow.width;
                dx = 0;
            }
        }

        if(this.moveType.ver) {
            dy = param.y - this.curY;
            this.viewWindow.y += dy;

            if(this.viewWindow.y > 0) {
                this.viewWindow.y = 0;
                dy = 0;
            }

            if(this.viewWindow.y < this.containerHeight - this.viewWindow.height) {
                this.viewWindow.y = this.containerHeight - this.viewWindow.height;
                dy = 0;
            }
        }

        this.curX = param.x;
        this.curY = param.y;

        globalShape.translate(dx, dy);
    }

    /**
     * 鼠标点按事件
     * @param event 
     */
    mouseDown(event: MouseEvent) {
        let globalShape = this.renderer.getGlobalShape();
        
        this.containerWidth = this.renderer.getContainerWidth();
        this.containerHeight = this.renderer.getContainerHeight();
        this.edgeOffsetX = this.containerWidth / 4;
        this.edgeOffsetY = this.containerHeight / 4;
        this.viewWindow = this.generateViewWindow(globalShape);
        this.curX = event.clientX;
        this.curY = event.clientY;

        if(this.viewWindow.width > this.containerWidth) {
            this.moveType.hor = true;
        }
        if(this.viewWindow.height > this.containerHeight) {
            this.moveType.ver = true;
        }

        if(this.moveType.hor || this.moveType.ver) {
            this.enableMove = true;
            this.interactionModel.setData('moving', true);
        }
    }

    /**
     * 鼠标移动事件
     * @param event 
     */
    mouseMove(event: MouseEvent) {
        if(this.enableMove) {
            this.handle({
                x: event.clientX,
                y: event.clientY
            });
        }
    }

    /**
     * 生成可移动视图窗口
     * @param globalShape
     */
    generateViewWindow(globalShape: GlobalShape): BoundingRect {
        let viewWindow = { x: 0, y: 0, width: this.containerWidth, height: this.containerHeight },
            globalBound = globalShape.getBound(),
            [ scaleX, scaleY ] = globalShape.getScale(),
            [ positionX, positionY ] = globalShape.getPosition(),
            scaledWidth = globalBound.width * scaleX,
            scaledHeight = globalBound.height * scaleY,
            minX = globalBound.x + positionX + (globalBound.width - scaledWidth) / 2,
            maxX = minX + scaledWidth,
            minY = globalBound.y + positionY + (globalBound.height - scaledHeight) / 2,
            maxY = minY + scaledHeight;

        if(minX < this.edgeOffsetX) {
            viewWindow.x = minX - this.edgeOffsetX;
            viewWindow.width += Math.abs(minX - this.edgeOffsetX);
        }

        if(maxX > this.containerWidth - this.edgeOffsetX) {
            viewWindow.width += maxX - (this.containerWidth - this.edgeOffsetX);
        }

        if(minY < this.edgeOffsetY) {
            viewWindow.y = minY - this.edgeOffsetY;
            viewWindow.height += Math.abs(minY - this.edgeOffsetY);
        }

        if(maxY > this.containerHeight - this.edgeOffsetY) {
            viewWindow.height += maxY - (this.containerHeight - this.edgeOffsetY);
        }

        return viewWindow;
    }

    /**
     * 重置所有数据
     */
    reset() {
        if(this.enableMove) {
            this.enableMove = false;
            this.interactionModel.setData('moving', false);
            this.moveType = { hor: false, ver: false };
        }
    }
}