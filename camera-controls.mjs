/* eslint-disable-next-line import/no-unresolved */
import { Vec2, Vec3, Ray, Plane, Mat4, Quat, Script, math } from 'https://cdn.jsdelivr.net/npm/playcanvas@2.3.3/build/playcanvas.mjs';

/** @import { CameraComponent } from 'playcanvas' */

const tmpVa = new Vec2();
const tmpV1 = new Vec3();
const tmpV2 = new Vec3(); // used for calculating offsets
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
     * The current focus (pivot) point of the camera.
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
     * Internal direction vector used when processing input.
     * @private
     * @type {Vec2}
     */
    _dir = new Vec2();

    /**
     * Internal Euler angles for the camera.
     * @private
     * @type {Vec3}
     */
    _angles = new Vec3();

    /**
     * The allowed pitch range.
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
     * Maximum zoom factor.
     * @private
     * @type {number}
     */
    _zoomMax = 0;

    /**
     * Current zoom distance (used as orbit radius).
     * @type {number}
     * @private
     */
    _zoomDist = 0;

    /**
     * A smoothed zoom distance for transitions.
     * @type {number}
     * @private
     */
    _cameraDist = 0;

    /**
     * Map of active pointer events.
     * @type {Map<number, PointerEvent>}
     * @private
     */
    _pointerEvents = new Map();

    /**
     * For touch pinch-zoom.
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
     * True when panning via left mouse.
     * @type {boolean}
     * @private
     */
    _panning = false;

    /**
     * True when using the right mouse button to rotate (i.e. tilt) the scene.
     * @type {boolean}
     * @private
     */
    _rotating = false;

    /**
     * Fly mode (unused in this configuration).
     * @type {boolean}
     * @private
     */
    _flying = false;

    /**
     * Accumulated input key states.
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
     * Camera transform for smoothing.
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
     * Optional target entity (e.g. the Gaussian splat scene) that will be rotated by right‑mouse drags.
     * @attribute
     * @type {Entity}
     */
    targetEntity = null;

    /**
     * Accumulated target rotation (Euler angles: [pitch, yaw]).
     * @private
     * @type {Vec2}
     */
    _targetRotation = new Vec2();

    /**
     * Sensitivity for rotating the target.
     * @attribute
     * @type {number}
     */
    rotateSensitivity = 0.5;

    /**
     * The scene size. Zoom, pan and fly speeds are relative to this.
     * @attribute
     * @type {number}
     */
    sceneSize = 100;

    /**
     * Look sensitivity.
     * @attribute
     * @type {number}
     */
    lookSensitivity = 0.2;

    /**
     * Look damping (1 means no damping).
     * @attribute
     * @type {number}
     */
    lookDamping = 0.97;

    /**
     * Move damping.
     * @attribute
     * @type {number}
     */
    moveDamping = 0.98;

    /**
     * Enable orbit/rotation (right mouse) controls.
     * @attribute
     * @type {boolean}
     */
    enableOrbit = true;

    /**
     * Enable panning (left mouse) controls.
     * @attribute
     * @type {boolean}
     */
    enablePan = true;

    /**
     * Enable fly controls (not used here).
     * @attribute
     * @type {boolean}
     */
    enableFly = true;

    /**
     * Touch pinch speed.
     * @attribute
     * @type {number}
     */
    pinchSpeed = 5;

    /**
     * Mouse wheel speed.
     * @attribute
     * @type {number}
     */
    wheelSpeed = 0.005;

    /**
     * Minimum zoom scale.
     * @attribute
     * @type {number}
     */
    zoomScaleMin = 0;

    /**
     * Fly move speed (unused).
     * @attribute
     * @type {number}
     */
    moveSpeed = 2;

    /**
     * Fly sprint speed (unused).
     * @attribute
     * @type {number}
     */
    sprintSpeed = 4;

    /**
     * Fly crouch speed (unused).
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
            crouchSpeed,
            targetEntity  // new attribute for rotating the scene
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
        if (targetEntity) {
            this.targetEntity = targetEntity;
        }
        // Initialize target rotation to current orientation (or zero)
        this._targetRotation.set(0, 0);

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

        // Set initial focus.
        this.focusPoint = focusPoint ?? this.focusPoint;
        this.pitchRange = pitchRange ?? this.pitchRange;
        this.zoomMin = zoomMin ?? this.zoomMin;
        this.zoomMax = zoomMax ?? this.zoomMax;
    }

    set element(value) {
        this._element = value;
        const camera = this._camera;
        this.detach();
        this.attach(camera);
    }
    get element() { return this._element; }

    set focusPoint(point) {
        if (!this._camera) { return; }
        this.focus(point, this._camera.entity.getPosition(), false);
    }
    get focusPoint() { return this._origin; }

    set pitchRange(value) {
        this._pitchRange.copy(value);
        this._dir.x = this._clampPitch(this._dir.x);
        this._smoothTransform(-1);
    }
    get pitchRange() { return this._pitchRange; }

    set zoomMin(value) {
        this._zoomMin = value;
        this._zoomDist = this._clampZoom(this._zoomDist);
        this._smoothZoom(-1);
    }
    get zoomMin() { return this._zoomMin; }

    set zoomMax(value) {
        this._zoomMax = value;
        this._zoomDist = this._clampZoom(this._zoomDist);
        this._smoothZoom(-1);
    }
    get zoomMax() { return this._zoomMax; }

    _clampPitch(value) {
        const min = this._pitchRange.x === -360 ? -Infinity : this._pitchRange.x;
        const max = this._pitchRange.y === 360 ? Infinity : this._pitchRange.y;
        return math.clamp(value, min, max);
    }

    _clampZoom(value) {
        const min = (this._camera?.nearClip ?? 0) + this.zoomMin * this.sceneSize;
        const max = this.zoomMax <= this.zoomMin ? Infinity : this.zoomMax * this.sceneSize;
        return math.clamp(value, min, max);
    }

    _onContextMenu(event) {
        event.preventDefault();
    }

    // Left mouse (button 0) starts panning.
    _isStartMousePan(event) {
        return this.enablePan && event.button === 0;
    }
    // Fly mode disabled.
    _isStartFly(event) {
        return false;
    }
    // Right mouse (button 2) now is used for rotating the target scene.
    _isStartOrbit(event) {
        return this.enableOrbit && event.button === 2;
    }

    _onPointerDown(event) {
        if (!this._camera) { return; }
        this._element.setPointerCapture(event.pointerId);
        this._pointerEvents.set(event.pointerId, event);
        const startMousePan = this._isStartMousePan(event);
        const startFly = this._isStartFly(event);
        const startRotate = this._isStartOrbit(event);
        if (startMousePan) {
            this._lastPosition.set(event.clientX, event.clientY);
            this._panning = true;
        }
        if (startFly) {
            // Not used.
            this._zoomDist = this._cameraDist;
            this._origin.copy(this._camera.entity.getPosition());
            this._position.copy(this._origin);
            this._cameraTransform.setTranslate(0, 0, 0);
            this._flying = true;
        }
        if (startRotate && this.targetEntity) {
            // When rotating, we use right mouse to update the target entity's rotation.
            this._rotating = true;
        }
    }

    _onPointerMove(event) {
        if (this._pointerEvents.size === 0) { return; }
        this._pointerEvents.set(event.pointerId, event);
        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else if (this._rotating) {
                // Instead of rotating the camera, update the target entity's rotation.
                // We use a sensitivity factor for the rotation.
                this._targetRotation.x -= (event.movementY || 0) * this.rotateSensitivity;
                this._targetRotation.y += (event.movementX || 0) * this.rotateSensitivity;
            }
            return;
        }
        if (this._pointerEvents.size === 2) {
            // For touch pinch zoom.
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                this._zoom((this._lastPinchDist - pinchDist) * this.pinchSpeed);
            }
            this._lastPinchDist = pinchDist;
        }
    }

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
        if (this._panning) { this._panning = false; }
        if (this._flying) {
            tmpV1.copy(this._camera.entity.forward).mulScalar(this._zoomDist);
            this._origin.add(tmpV1);
            this._position.add(tmpV1);
            this._flying = false;
        }
    }

    _onWheel(event) {
        event.preventDefault();
        this._zoom(event.deltaY);
    }

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

    // For camera rotations caused by panning (left button),
    // _look() is used. (Right mouse no longer calls _look.)
    _look(event) {
        if (event.target !== this.app.graphicsDevice.canvas) { return; }
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this._dir.x = this._clampPitch(this._dir.x - movementY * this.lookSensitivity);
        this._dir.y -= movementX * this.lookSensitivity;
    }

    // Panning: move the camera focus (_origin) based on pointer movement.
    _pan(pos) {
        if (!this.enablePan) { return; }
        const start = new Vec3();
        const end = new Vec3();
        this._screenToWorldPan(this._lastPosition, start);
        this._screenToWorldPan(pos, end);
        tmpV1.sub2(start, end);
        // Increase pan sensitivity when zoomed in.
        const panFactor = math.clamp(this.sceneSize / this._zoomDist, 1, 5);
        tmpV1.mulScalar(panFactor);
        this._origin.add(tmpV1);
        this._lastPosition.copy(pos);
    }

    // Zooming function.
    _zoom(delta) {
        if (!this.enableOrbit && !this.enablePan) { return; }
        if (!this._camera) { return; }
        const distNormalized = this._zoomDist / (ZOOM_SCALE_SCENE_MULT * this.sceneSize);
        const scale = math.clamp(distNormalized, this.zoomScaleMin, 1);
        this._zoomDist += delta * this.wheelSpeed * this.sceneSize * scale;
        this._zoomDist = this._clampZoom(this._zoomDist);
    }

    _smoothZoom(dt) {
        const a = dt === -1 ? 1 : lerpRate(this.moveDamping, dt);
        this._cameraDist = math.lerp(this._cameraDist, this._zoomDist, a);
        this._cameraTransform.setTranslate(0, 0, this._cameraDist);
    }

    // _smoothTransform updates the camera's base transform.
    // If we are only panning, the camera's position interpolates toward _origin.
    // When rotating (right mouse drags) the camera remains fixed.
    _smoothTransform(dt) {
        const a = dt === -1 ? 1 : lerpRate(this.lookDamping, dt);
        // Smooth camera angles (used for panning if needed).
        this._angles.x = math.lerp(this._angles.x, this._dir.x, a);
        this._angles.y = math.lerp(this._angles.y, this._dir.y, a);
        if (!this._rotating) {
            this._position.lerp(this._position, this._origin, a);
        }
        this._baseTransform.setTRS(this._position, tmpQ1.setFromEulerAngles(this._angles), Vec3.ONE);
    }

    _updateTransform() {
        tmpM1.copy(this._baseTransform).mul(this._cameraTransform);
        this._camera.entity.setPosition(tmpM1.getTranslation());
        this._camera.entity.setEulerAngles(tmpM1.getEulerAngles());
    }

    // Focus the camera on a point.
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

    resetZoom(zoomDist = 0, smooth = true) {
        this._zoomDist = zoomDist;
        if (!smooth) {
            this._cameraDist = zoomDist;
        }
    }

    refocus(point, start = null, zoomDist, smooth = true) {
        if (typeof zoomDist === 'number') {
            this.resetZoom(zoomDist, smooth);
        }
        this.focus(point, start, smooth);
    }

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

    update(dt) {
        if (this.app.xr?.active) { return; }
        if (!this._camera) { return; }
        // Update panning or fly mode (if active).
        this._move(dt);
        if (!this._flying) { this._smoothZoom(dt); }
        this._smoothTransform(dt);
        this._updateTransform();
        // Additionally, if a target entity is set, update its rotation based on right mouse drags.
        if (this.targetEntity) {
            this.targetEntity.setEulerAngles(this._targetRotation.x, this._targetRotation.y, 0);
        }
    }

    destroy() {
        this.detach();
    }
}

export { CameraControls };
