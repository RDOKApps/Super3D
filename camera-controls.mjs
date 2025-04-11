/* eslint-disable-next-line import/no-unresolved */
import { Vec2, Vec3, Ray, Plane, Mat4, Quat, Script, math } from 'https://cdn.jsdelivr.net/npm/playcanvas@2.3.3/build/playcanvas.mjs';

/** @import { CameraComponent } from 'playcanvas' */

const tmpVa = new Vec2();
const tmpV1 = new Vec3();
const tmpV2 = new Vec3(); // used for orbit offset calculation
const tmpM1 = new Mat4();
const tmpQ1 = new Quat();
const tmpR1 = new Ray();
const tmpP1 = new Plane();

const PASSIVE = { passive: false };
const ZOOM_SCALE_SCENE_MULT = 10;

/**
 * Calculate the lerp rate.
 *
 * @param {number} damping - The damping.
 * @param {number} dt - The delta time.
 * @returns {number} - The lerp rate.
 */
const lerpRate = (damping, dt) => 1 - Math.pow(damping, dt * 1000);

class CameraControls extends Script {
    /**
     * @private
     * @type {CameraComponent}
     */
    _camera = null;

    /**
     * The current scene focus (or pivot) point.
     * @private
     * @type {Vec3}
     */
    _origin = new Vec3();

    /**
     * The current camera position.
     * @private
     * @type {Vec3}
     */
    _position = new Vec3();

    /**
     * Temporary vector for input direction.
     * @private
     * @type {Vec2}
     */
    _dir = new Vec2();

    /**
     * The current Euler angles for rotation.
     * @private
     * @type {Vec3}
     */
    _angles = new Vec3();

    /**
     * Limits for pitch.
     * @private
     * @type {Vec2}
     */
    _pitchRange = new Vec2(-360, 360);

    /**
     * Minimum zoom factor (relative to scene size).
     * @private
     * @type {number}
     */
    _zoomMin = 0;

    /**
     * Maximum zoom factor (relative to scene size).
     * @private
     * @type {number}
     */
    _zoomMax = 0;

    /**
     * Current zoom distance (used as a radius for orbiting).
     * @type {number}
     * @private
     */
    _zoomDist = 0;

    /**
     * Camera distance used for smoothing zoom.
     * @type {number}
     * @private
     */
    _cameraDist = 0;

    /**
     * Active pointer events.
     * @type {Map<number, PointerEvent>}
     * @private
     */
    _pointerEvents = new Map();

    /**
     * For pinch zoom in touch mode.
     * @type {number}
     * @private
     */
    _lastPinchDist = -1;

    /**
     * Last pointer position.
     * @type {Vec2}
     * @private
     */
    _lastPosition = new Vec2();

    /**
     * True if panning (left mouse).
     * @type {boolean}
     * @private
     */
    _panning = false;

    /**
     * True if orbiting/rotating (right mouse).
     * @type {boolean}
     * @private
     */
    _rotating = false;

    /**
     * (Fly mode not used in this configuration.)
     * @type {boolean}
     * @private
     */
    _flying = false;

    /**
     * Input key state.
     * @type {Record<string, boolean>}
     * @private
     */
    _key = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        sprint: false,
        crouch: false
    };

    /**
     * The HTML element to which events are attached.
     * @type {HTMLElement}
     * @private
     */
    _element;

    /**
     * Camera transform applied after base transform (used for zoom).
     * @type {Mat4}
     * @private
     */
    _cameraTransform = new Mat4();

    /**
     * Base transform computed from position and rotation.
     * @type {Mat4}
     * @private
     */
    _baseTransform = new Mat4();

    /**
     * The scene size (speeds are relative to this).
     *
     * @attribute
     * @type {number}
     */
    sceneSize = 100;

    /**
     * Look sensitivity.
     *
     * @attribute
     * @type {number}
     */
    lookSensitivity = 0.2;

    /**
     * Look damping (1 means no damping).
     *
     * @attribute
     * @type {number}
     */
    lookDamping = 0.97;

    /**
     * Move damping.
     *
     * @attribute
     * @type {number}
     */
    moveDamping = 0.98;

    /**
     * Enable orbit (rotation) controls.
     *
     * @attribute
     * @type {boolean}
     */
    enableOrbit = true;

    /**
     * Enable panning controls.
     *
     * @attribute
     * @type {boolean}
     */
    enablePan = true;

    /**
     * Enable fly controls (not used here).
     *
     * @attribute
     * @type {boolean}
     */
    enableFly = true;

    /**
     * Touch pinch speed.
     *
     * @attribute
     * @type {number}
     */
    pinchSpeed = 5;

    /**
     * Mouse wheel speed.
     *
     * @attribute
     * @type {number}
     */
    wheelSpeed = 0.005;

    /**
     * Minimum zoom scale.
     *
     * @attribute
     * @type {number}
     */
    zoomScaleMin = 0;

    /**
     * Fly move speed (unused here).
     *
     * @attribute
     * @type {number}
     */
    moveSpeed = 2;

    /**
     * Fly sprint speed (unused here).
     *
     * @attribute
     * @type {number}
     */
    sprintSpeed = 4;

    /**
     * Fly crouch speed (unused here).
     *
     * @attribute
     * @type {number}
     */
    crouchSpeed = 1;

    /**
     * @param {object} args - The script arguments.
     */
    constructor(args) {
        super(args);
        const {
            element,
            enableOrbit,
            enablePan,
            enableFly,
            focusPoint,
            sceneSize,
            lookSensitivity,
            lookDamping,
            moveDamping,
            pitchRange,
            pinchSpeed,
            wheelSpeed,
            zoomMin,
            zoomMax,
            moveSpeed,
            sprintSpeed,
            crouchSpeed
        } = args.attributes;

        this._element = element ?? this.app.graphicsDevice.canvas;

        this.enableOrbit = enableOrbit ?? this.enableOrbit;
        this.enablePan = enablePan ?? this.enablePan;
        this.enableFly = enableFly ?? this.enableFly;
        this.sceneSize = sceneSize ?? this.sceneSize;
        this.lookSensitivity = lookSensitivity ?? this.lookSensitivity;
        this.lookDamping = lookDamping ?? this.lookDamping;
        this.moveDamping = moveDamping ?? this.moveDamping;
        this.pinchSpeed = pinchSpeed ?? this.pinchSpeed;
        this.wheelSpeed = wheelSpeed ?? this.wheelSpeed;

        this.moveSpeed = moveSpeed ?? this.moveSpeed;
        this.sprintSpeed = sprintSpeed ?? this.sprintSpeed;
        this.crouchSpeed = crouchSpeed ?? this.crouchSpeed;

        // Bind event handlers.
        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);

        if (!this.entity.camera) {
            throw new Error('CameraControls script requires a camera component');
        }
        this.attach(this.entity.camera);

        // Set the initial focus.
        this.focusPoint = focusPoint ?? this.focusPoint;
        this.pitchRange = pitchRange ?? this.pitchRange;
        this.zoomMin = zoomMin ?? this.zoomMin;
        this.zoomMax = zoomMax ?? this.zoomMax;
    }

    /**
     * Sets the element to which events are attached.
     * @type {HTMLElement}
     */
    set element(value) {
        this._element = value;
        const camera = this._camera;
        this.detach();
        this.attach(camera);
    }
    get element() {
        return this._element;
    }

    /**
     * Set the camera's focus point.
     * @param {Vec3} point - The focus point.
     */
    set focusPoint(point) {
        if (!this._camera) { return; }
        this.focus(point, this._camera.entity.getPosition(), false);
    }
    get focusPoint() {
        return this._origin;
    }

    /**
     * Set the pitch range.
     * @attribute
     * @type {Vec2}
     */
    set pitchRange(value) {
        this._pitchRange.copy(value);
        this._dir.x = this._clampPitch(this._dir.x);
        this._smoothTransform(-1);
    }
    get pitchRange() {
        return this._pitchRange;
    }

    /**
     * Set minimum zoom.
     * @attribute
     * @type {number}
     */
    set zoomMin(value) {
        this._zoomMin = value;
        this._zoomDist = this._clampZoom(this._zoomDist);
        this._smoothZoom(-1);
    }
    get zoomMin() {
        return this._zoomMin;
    }

    /**
     * Set maximum zoom.
     * @attribute
     * @type {number}
     */
    set zoomMax(value) {
        this._zoomMax = value;
        this._zoomDist = this._clampZoom(this._zoomDist);
        this._smoothZoom(-1);
    }
    get zoomMax() {
        return this._zoomMax;
    }

    /**
     * @private
     * Clamp the pitch value.
     * @param {number} value - The pitch.
     * @returns {number} - The clamped value.
     */
    _clampPitch(value) {
        const min = this._pitchRange.x === -360 ? -Infinity : this._pitchRange.x;
        const max = this._pitchRange.y === 360 ? Infinity : this._pitchRange.y;
        return math.clamp(value, min, max);
    }

    /**
     * @private
     * Clamp the zoom value.
     * @param {number} value - The zoom value.
     * @returns {number} - The clamped value.
     */
    _clampZoom(value) {
        const min = (this._camera?.nearClip ?? 0) + this.zoomMin * this.sceneSize;
        const max = this.zoomMax <= this.zoomMin ? Infinity : this.zoomMax * this.sceneSize;
        return math.clamp(value, min, max);
    }

    /**
     * @private
     * Prevents the context menu.
     * @param {MouseEvent} event - The event.
     */
    _onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * @private
     * Determines if panning (left mouse) should start.
     * @param {PointerEvent} event - The pointer event.
     * @returns {boolean} - True if left button is used.
     */
    _isStartMousePan(event) {
        return this.enablePan && event.button === 0;
    }

    /**
     * @private
     * Fly mode is disabled.
     * @param {PointerEvent} event - The pointer event.
     * @returns {boolean} - Always false.
     */
    _isStartFly(event) {
        return false;
    }

    /**
     * @private
     * Determines if rotation (orbit) should start (right mouse).
     * @param {PointerEvent} event - The pointer event.
     * @returns {boolean} - True if right button is used.
     */
    _isStartOrbit(event) {
        return this.enableOrbit && event.button === 2;
    }

    /**
     * @private
     * Pointer down event handler.
     * @param {PointerEvent} event - The pointer event.
     */
    _onPointerDown(event) {
        if (!this._camera) { return; }
        this._element.setPointerCapture(event.pointerId);
        this._pointerEvents.set(event.pointerId, event);

        const startMousePan = this._isStartMousePan(event);
        const startFly = this._isStartFly(event);
        const startOrbit = this._isStartOrbit(event);

        if (startMousePan) {
            // Start panning: record the last pointer position.
            this._lastPosition.set(event.clientX, event.clientY);
            this._panning = true;
        }
        if (startFly) {
            // Fly mode not used.
            this._zoomDist = this._cameraDist;
            this._origin.copy(this._camera.entity.getPosition());
            this._position.copy(this._origin);
            this._cameraTransform.setTranslate(0, 0, 0);
            this._flying = true;
        }
        if (startOrbit) {
            // For rotation/orbit mode, we simply set the flag.
            // The focus (_origin) remains unchanged.
            this._rotating = true;
        }
    }

    /**
     * @private
     * Pointer move event handler.
     * @param {PointerEvent} event - The pointer event.
     */
    _onPointerMove(event) {
        if (this._pointerEvents.size === 0) { return; }
        this._pointerEvents.set(event.pointerId, event);

        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                // Update panning based on left mouse movement.
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else if (this._rotating || this._flying) {
                // For orbit/rotation, update the directional angles.
                this._look(event);
            }
            return;
        }
        if (this._pointerEvents.size === 2) {
            // Touch-based pinch zoom.
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                this._zoom((this._lastPinchDist - pinchDist) * this.pinchSpeed);
            }
            this._lastPinchDist = pinchDist;
        }
    }

    /**
     * @private
     * Pointer up event handler.
     * @param {PointerEvent} event - The pointer event.
     */
    _onPointerUp(event) {
        this._element.releasePointerCapture(event.pointerId);
        this._pointerEvents.delete(event.pointerId);
        if (this._pointerEvents.size < 2) {
            this._lastPinchDist = -1;
            this._panning = false;
        }
        if (this._rotating) {
            this._rotating = false;
        }
        if (this._panning) {
            this._panning = false;
        }
        if (this._flying) {
            tmpV1.copy(this._camera.entity.forward).mulScalar(this._zoomDist);
            this._origin.add(tmpV1);
            this._position.add(tmpV1);
            this._flying = false;
        }
    }

    /**
     * @private
     * Mouse wheel handler for zooming.
     * @param {WheelEvent} event - The wheel event.
     */
    _onWheel(event) {
        event.preventDefault();
        this._zoom(event.deltaY);
    }

    /**
     * @private
     * Key down event handler.
     * @param {KeyboardEvent} event - The keyboard event.
     */
    _onKeyDown(event) {
        event.stopPropagation();
        switch (event.key.toLowerCase()) {
            case 'w': this._key.forward = true; break;
            case 's': this._key.backward = true; break;
            case 'a': this._key.left = true; break;
            case 'd': this._key.right = true; break;
            case 'q': this._key.up = true; break;
            case 'e': this._key.down = true; break;
            case 'shift': this._key.sprint = true; break;
            case 'control': this._key.crouch = true; break;
        }
    }

    /**
     * @private
     * Key up event handler.
     * @param {KeyboardEvent} event - The keyboard event.
     */
    _onKeyUp(event) {
        event.stopPropagation();
        switch (event.key.toLowerCase()) {
            case 'w': this._key.forward = false; break;
            case 's': this._key.backward = false; break;
            case 'a': this._key.left = false; break;
            case 'd': this._key.right = false; break;
            case 'q': this._key.up = false; break;
            case 'e': this._key.down = false; break;
            case 'shift': this._key.sprint = false; break;
            case 'control': this._key.crouch = false; break;
        }
    }

    /**
     * @private
     * Updates the directional angles based on pointer movement.
     * @param {PointerEvent} event - The pointer event.
     */
    _look(event) {
        if (event.target !== this.app.graphicsDevice.canvas) { return; }
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this._dir.x = this._clampPitch(this._dir.x - movementY * this.lookSensitivity);
        this._dir.y -= movementX * this.lookSensitivity;
    }

    /**
     * @param {number} dt - Delta time.
     * (For fly mode; unused in this configuration.)
     */
    _move(dt) {
        if (!this.enableFly) { return; }
        tmpV1.set(0, 0, 0);
        if (this._key.forward) { tmpV1.add(this._camera.entity.forward); }
        if (this._key.backward) { tmpV1.sub(this._camera.entity.forward); }
        if (this._key.left) { tmpV1.sub(this._camera.entity.right); }
        if (this._key.right) { tmpV1.add(this._camera.entity.right); }
        if (this._key.up) { tmpV1.add(this._camera.entity.up); }
        if (this._key.down) { tmpV1.sub(this._camera.entity.up); }
        tmpV1.normalize();
        const speed = this._key.crouch ? this.crouchSpeed : (this._key.sprint ? this.sprintSpeed : this.moveSpeed);
        tmpV1.mulScalar(this.sceneSize * speed * dt);
        this._origin.add(tmpV1);
    }

    /**
     * @private
     * Computes the midpoint between two pointer events.
     * @param {Vec2} out - The output vector.
     * @returns {Vec2} - The midpoint.
     */
    _getMidPoint(out) {
        const [a, b] = this._pointerEvents.values();
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return out.set(b.clientX + dx * 0.5, b.clientY + dy * 0.5);
    }

    /**
     * @private
     * Computes the distance between two pointer events.
     * @returns {number} - The pinch distance.
     */
    _getPinchDist() {
        const [a, b] = this._pointerEvents.values();
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * @private
     * Converts a screen coordinate to a world point by intersecting a ray with a plane.
     * @param {Vec2} pos - Screen coordinate.
     * @param {Vec3} point - Output world point.
     */
    _screenToWorldPan(pos, point) {
        const mouseW = this._camera.screenToWorld(pos.x, pos.y, 1);
        const cameraPos = this._camera.entity.getPosition();
        const focusDirScaled = tmpV1.copy(this._camera.entity.forward).mulScalar(this._zoomDist);
        const focalPos = tmpV2.add2(cameraPos, focusDirScaled);
        const planeNormal = focusDirScaled.mulScalar(-1).normalize();
        const plane = tmpP1.setFromPointNormal(focalPos, planeNormal);
        const ray = tmpR1.set(cameraPos, mouseW.sub(cameraPos).normalize());
        plane.intersectsRay(ray, point);
    }

    /**
     * @private
     * Pans the scene based on pointer movement.
     * The pan delta is scaled when zoomed in.
     * @param {Vec2} pos - Current screen position.
     */
    _pan(pos) {
        if (!this.enablePan) { return; }
        const start = new Vec3();
        const end = new Vec3();
        this._screenToWorldPan(this._lastPosition, start);
        this._screenToWorldPan(pos, end);
        tmpV1.sub2(start, end);
        // Compute a pan factor that increases sensitivity when zoomed in.
        const panFactor = math.clamp(this.sceneSize / this._zoomDist, 1, 5);
        tmpV1.mulScalar(panFactor);
        this._origin.add(tmpV1);
        this._lastPosition.copy(pos);
    }

    /**
     * @private
     * Zooms the camera based on wheel delta.
     * @param {number} delta - The wheel delta.
     */
    _zoom(delta) {
        if (!this.enableOrbit && !this.enablePan) { return; }
        if (!this._camera) { return; }
        const distNormalized = this._zoomDist / (ZOOM_SCALE_SCENE_MULT * this.sceneSize);
        const scale = math.clamp(distNormalized, this.zoomScaleMin, 1);
        this._zoomDist += delta * this.wheelSpeed * this.sceneSize * scale;
        this._zoomDist = this._clampZoom(this._zoomDist);
    }

    /**
     * @private
     * Smoothly updates the zoom (camera distance).
     * @param {number} dt - Delta time.
     */
    _smoothZoom(dt) {
        const a = dt === -1 ? 1 : lerpRate(this.moveDamping, dt);
        this._cameraDist = math.lerp(this._cameraDist, this._zoomDist, a);
        this._cameraTransform.setTranslate(0, 0, this._cameraDist);
    }

    /**
     * @private
     * Smoothly updates the camera transform.
     * In panning mode, the position interpolates toward the focus (_origin).
     * In orbit (rotation) mode, the camera position is computed from the focus plus an offset 
     * derived from _zoomDist and _angles.
     * @param {number} dt - Delta time.
     */
    _smoothTransform(dt) {
        const a = dt === -1 ? 1 : lerpRate(this.lookDamping, dt);
        // Smooth the angles based on input (_dir).
        this._angles.x = math.lerp(this._angles.x, this._dir.x, a);
        this._angles.y = math.lerp(this._angles.y, this._dir.y, a);
        if (this._rotating) {
            // In orbit (rotation) mode, compute position from focus plus offset.
            tmpV2.set(0, 0, this._zoomDist);
            tmpV2.applyEulerAngles(this._angles.x, this._angles.y, 0);
            this._position.copy(this._origin).add(tmpV2);
        } else {
            // In panning mode, interpolate camera position toward the focus.
            this._position.lerp(this._position, this._origin, a);
        }
        this._baseTransform.setTRS(this._position, tmpQ1.setFromEulerAngles(this._angles), Vec3.ONE);
    }

    /**
     * @private
     * Updates the camera entity with the current transform.
     */
    _updateTransform() {
        tmpM1.copy(this._baseTransform).mul(this._cameraTransform);
        this._camera.entity.setPosition(tmpM1.getTranslation());
        this._camera.entity.setEulerAngles(tmpM1.getEulerAngles());
    }

    /**
     * Focuses the camera on a point.
     * @param {Vec3} point - The new focus point.
     * @param {Vec3} [start] - The starting point.
     * @param {boolean} [smooth] - If smoothing is applied.
     */
    focus(point, start, smooth = true) {
        if (!this._camera) { return; }
        if (this._flying) { return; }
        if (!start) {
            this._origin.copy(point);
            if (!smooth) { this._position.copy(point); }
            return;
        }
        tmpV1.sub2(start, point);
        const elev = Math.atan2(tmpV1.y, Math.sqrt(tmpV1.x * tmpV1.x + tmpV1.z * tmpV1.z)) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._dir.set(this._clampPitch(-elev), azim);
        this._origin.copy(point);
        this._cameraTransform.setTranslate(0, 0, 0);
        const pos = this._camera.entity.getPosition();
        const rot = this._camera.entity.getRotation();
        this._baseTransform.setTRS(pos, rot, Vec3.ONE);
        this._zoomDist = this._clampZoom(tmpV1.length());
        if (!smooth) {
            this._smoothZoom(-1);
            this._smoothTransform(-1);
        }
        this._updateTransform();
    }

    /**
     * Resets the zoom (for orbit and panning).
     * @param {number} [zoomDist] - The new zoom distance.
     * @param {boolean} [smooth] - Whether to smooth the change.
     */
    resetZoom(zoomDist = 0, smooth = true) {
        this._zoomDist = zoomDist;
        if (!smooth) {
            this._cameraDist = zoomDist;
        }
    }

    /**
     * Refocuses the camera.
     * @param {Vec3} point - The new focus point.
     * @param {Vec3} [start] - The starting point.
     * @param {number} [zoomDist] - The new zoom distance.
     * @param {boolean} [smooth] - Whether to smooth the change.
     */
    refocus(point, start = null, zoomDist, smooth = true) {
        if (typeof zoomDist === 'number') {
            this.resetZoom(zoomDist, smooth);
        }
        this.focus(point, start, smooth);
    }

    /**
     * Attaches the camera and adds event listeners.
     * @param {CameraComponent} camera - The camera component.
     */
    attach(camera) {
        this._camera = camera;
        this._element.addEventListener('wheel', this._onWheel, PASSIVE);
        this._element.addEventListener('pointerdown', this._onPointerDown);
        this._element.addEventListener('pointermove', this._onPointerMove);
        this._element.addEventListener('pointerup', this._onPointerUp);
        this._element.addEventListener('contextmenu', this._onContextMenu);
        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Detaches event listeners.
     */
    detach() {
        this._element.removeEventListener('wheel', this._onWheel, PASSIVE);
        this._element.removeEventListener('pointermove', this._onPointerMove);
        this._element.removeEventListener('pointerdown', this._onPointerDown);
        this._element.removeEventListener('pointerup', this._onPointerUp);
        this._element.removeEventListener('contextmenu', this._onContextMenu);
        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);
        this._camera = null;
        this._dir.x = this._angles.x;
        this._dir.y = this._angles.y;
        this._origin.copy(this._position);
        this._pointerEvents.clear();
        this._lastPinchDist = -1;
        this._panning = false;
        this._rotating = false;
        this._key = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false,
            sprint: false,
            crouch: false
        };
    }

    /**
     * Called every frame to update the camera.
     * @param {number} dt - Delta time.
     */
    update(dt) {
        if (this.app.xr?.active) { return; }
        if (!this._camera) { return; }
        this._move(dt);
        if (!this._flying) { this._smoothZoom(dt); }
        this._smoothTransform(dt);
        this._updateTransform();
    }

    destroy() {
        this.detach();
    }
}

export { CameraControls };
