/* eslint-disable-next-line import/no-unresolved */
import { Vec2, Vec3, Ray, Plane, Mat4, Quat, Script, math } from 'https://cdn.jsdelivr.net/npm/playcanvas@2.3.3/build/playcanvas.mjs';

/** @import { CameraComponent } from 'playcanvas' */

const tmpVa = new Vec2();
const tmpV1 = new Vec3();
const tmpV2 = new Vec3();  // used for computing orbit offset
const tmpM1 = new Mat4();
const tmpQ1 = new Quat();
const tmpR1 = new Ray();
const tmpP1 = new Plane();

const PASSIVE = { passive: false };
const ZOOM_SCALE_SCENE_MULT = 10;

/**
 * Calculate the lerp rate.
 * @param {number} damping - Damping factor.
 * @param {number} dt - Delta time.
 * @returns {number} - The lerp rate.
 */
const lerpRate = (damping, dt) => 1 - Math.pow(damping, dt * 1000);

class CameraControls extends Script {
    _camera = null;
    // The focal point (pivot) that the camera orbits.
    _origin = new Vec3();
    // Computed camera position.
    _position = new Vec3();
    // Temporary for pointer-based rotation input (in degrees).
    _dir = new Vec2();
    // Current Euler angles (pitch, yaw) for orbiting.
    _angles = new Vec3();
    _pitchRange = new Vec2(-360, 360);
    _zoomMin = 0;
    _zoomMax = 0;
    // _zoomDist is the desired orbit radius.
    _zoomDist = 0;
    // _cameraDist is the smoothed zoom distance.
    _cameraDist = 0;
    _pointerEvents = new Map();
    _lastPinchDist = -1;
    _lastPosition = new Vec2();
    // Panning flag.
    _panning = false;
    // Rotating (orbiting) flag.
    _rotating = false;
    _flying = false;
    _key = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        crouch: false
    };

    // NEW: targetEntity is the entity to rotate when Q/E are pressed.
    // If not explicitly set, the script will try to find an entity named "splat".
    targetEntity = null;

    _element;
    _cameraTransform = new Mat4();
    _baseTransform = new Mat4();

    // Scene & control parameters.
    sceneSize = 100;
    lookSensitivity = 0.2;
    lookDamping = 0.97;
    moveDamping = 0.98;
    enableOrbit = true;
    enablePan = true;
    enableFly = true;
    pinchSpeed = 5;
    wheelSpeed = 0.005;
    zoomScaleMin = 0;
    moveSpeed = 2;
    sprintSpeed = 4;
    crouchSpeed = 1;
    
    // rotateSensitivity is in degrees per key press step.
    rotateSensitivity = 5;

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
            targetEntity  // New attribute to specify the model to rotate.
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
        if (!this._camera) return;
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

    // Use left mouse (button 0) for panning.
    _isStartMousePan(event) {
        return this.enablePan && event.button === 0;
    }
    _isStartFly(event) {
        return false;
    }
    // Right mouse (button 2) for orbit rotation.
    _isStartOrbit(event) {
        return this.enableOrbit && event.button === 2;
    }

    _onPointerDown(event) {
        if (!this._camera) return;
        this._element.setPointerCapture(event.pointerId);
        this._pointerEvents.set(event.pointerId, event);
        const startMousePan = this._isStartMousePan(event);
        const startOrbit = this._isStartOrbit(event);
        if (startMousePan) {
            this._lastPosition.set(event.clientX, event.clientY);
            this._panning = true;
        }
        if (startOrbit) {
            this._rotating = true;
        }
    }

    _onPointerMove(event) {
        if (this._pointerEvents.size === 0) return;
        this._pointerEvents.set(event.pointerId, event);
        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else if (this._rotating) {
                // Update the rotation input based on pointer movement.
                const movementX = event.movementX || 0;
                const movementY = event.movementY || 0;
                // Only update _dir so that pointer motion affects orbit orbiting.
                this._dir.x = this._clampPitch(this._dir.x - movementY * this.lookSensitivity);
                this._dir.y -= movementX * this.lookSensitivity;
            }
            return;
        }
        if (this._pointerEvents.size === 2) {
            // Touch pinch-zoom.
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
    }

    _onWheel(event) {
        event.preventDefault();
        this._zoom(event.deltaY);
    }

    // For Q and E keys: update the target entity's local Y rotation.
    _onKeyDown(event) {
        event.stopPropagation();
        const key = event.key.toLowerCase();
        if (key === 'q' || key === 'e') {
            // Try to get the target entity. If not explicitly assigned, attempt to find an entity named "splat".
            let target = this.targetEntity || this.app.root.findByName("splat");
            if (target) {
                // Use local Euler angles to rotate the target horizontally.
                let rot = target.getLocalEulerAngles();
                if (key === 'q') {
                    rot.y -= this.rotateSensitivity;
                } else { // key === 'e'
                    rot.y += this.rotateSensitivity;
                }
                target.setLocalEulerAngles(rot.x, rot.y, rot.z);
                event.preventDefault();
                return;
            } else {
                // If no target entity is set, adjust the camera orbit's yaw.
                if (key === 'q') {
                    this._angles.y -= this.rotateSensitivity;
                } else {
                    this._angles.y += this.rotateSensitivity;
                }
                event.preventDefault();
                return;
            }
        } else {
            switch (key) {
                case 'w': this._key.forward = true; break;
                case 's': this._key.backward = true; break;
                case 'a': this._key.left = true; break;
                case 'd': this._key.right = true; break;
                case 'shift': this._key.sprint = true; break;
                case 'control': this._key.crouch = true; break;
            }
        }
    }

    _onKeyUp(event) {
        event.stopPropagation();
        const key = event.key.toLowerCase();
        if (key !== 'q' && key !== 'e') {
            switch (key) {
                case 'w': this._key.forward = false; break;
                case 's': this._key.backward = false; break;
                case 'a': this._key.left = false; break;
                case 'd': this._key.right = false; break;
                case 'shift': this._key.sprint = false; break;
                case 'control': this._key.crouch = false; break;
            }
        }
    }

    // _look() is used for pointer-based orbiting.
    _look(event) {
        if (event.target !== this.app.graphicsDevice.canvas) return;
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        this._dir.x = this._clampPitch(this._dir.x - movementY * this.lookSensitivity);
        this._dir.y -= movementX * this.lookSensitivity;
    }

    // _pan() computes a translation for the focal point (_origin) based on pointer movement.
    _pan(pos) {
        if (!this.enablePan) return;
        const start = new Vec3();
        const end = new Vec3();
        this._screenToWorldPan(this._lastPosition, start);
        this._screenToWorldPan(pos, end);
        tmpV1.sub2(start, end);
        const panFactor = math.clamp(this.sceneSize / this._zoomDist, 1, 5);
        tmpV1.mulScalar(panFactor);
        this._origin.add(tmpV1);
        this._lastPosition.copy(pos);
    }

    _zoom(delta) {
        if (!this.enableOrbit && !this.enablePan) return;
        if (!this._camera) return;
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

    // _smoothTransform updates the camera's orbit.
    _smoothTransform(dt) {
        const a = dt === -1 ? 1 : lerpRate(this.lookDamping, dt);
        if (this._rotating) {
            this._angles.x = math.lerp(this._angles.x, this._dir.x, a);
            this._angles.y = math.lerp(this._angles.y, this._dir.y, a);
        }
        // Compute camera position as: _position = _origin + (rotated local vector [0, 0, _zoomDist]).
        tmpV2.set(0, 0, this._zoomDist);
        tmpV2.applyEulerAngles(this._angles.x, this._angles.y, 0);
        this._position.copy(this._origin).add(tmpV2);
        this._baseTransform.setTRS(this._position, tmpQ1.setFromEulerAngles(this._angles), Vec3.ONE);
    }

    _updateTransform() {
        tmpM1.copy(this._baseTransform).mul(this._cameraTransform);
        this._camera.entity.setPosition(tmpM1.getTranslation());
        this._camera.entity.setEulerAngles(tmpM1.getEulerAngles());
    }

    focus(point, start, smooth = true) {
        if (!this._camera) return;
        if (this._flying) return;
        if (!start) {
            this._origin.copy(point);
            if (!smooth) this._position.copy(point);
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
        if (!smooth) this._cameraDist = zoomDist;
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
            sprint: false,
            crouch: false
        };
    }

    update(dt) {
        if (this.app.xr?.active) return;
        if (!this._camera) return;
        this._move(dt);
        if (!this._flying) this._smoothZoom(dt);
        this._smoothTransform(dt);
        this._updateTransform();
    }

    destroy() {
        this.detach();
    }
}

export { CameraControls };
