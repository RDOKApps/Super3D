// controls.js
import { Events }   from 'https://cdn.jsdelivr.net/gh/playcanvas/supersplat@main/src/events.ts';               // :contentReference[oaicite:0]{index=0}
import { Tooltips } from 'https://cdn.jsdelivr.net/gh/playcanvas/supersplat@main/src/ui/tooltips.ts';         // :contentReference[oaicite:1]{index=1}
import { ModeToggle } from 'https://cdn.jsdelivr.net/gh/playcanvas/supersplat@main/src/ui/mode-toggle.ts';     // :contentReference[oaicite:2]{index=2}
import { ViewCube }  from 'https://cdn.jsdelivr.net/gh/playcanvas/supersplat@main/src/ui/view-cube.ts';        // :contentReference[oaicite:3]{index=3}

export function initGitHubControls(app) {
    const events   = new Events();
    const tooltips = new Tooltips();

    // hide default UI
    const defaultUI = document.getElementById('controlsWrap');
    if (defaultUI) defaultUI.style.display = 'none';

    // container for custom widgets
    const container = document.createElement('div');
    container.id = 'github-controls';
    Object.assign(container.style, {
        position: 'absolute',
        bottom:   '10px',
        right:    '10px',
        pointerEvents: 'none',
        zIndex:   1000
    });
    document.body.appendChild(container);

    // Orbit / Fly toggle
    new ModeToggle(events, tooltips, { parent: container });

    // View-cube widget
    const viewCube = new ViewCube(events, { parent: container });
    app.on('update', () => {
        const cam = app.root.findByName('camera');
        const vm  = cam.script.camera.entity.getViewMatrix();
        viewCube.update(vm);
    });

    // re-parent “Frame” & “Reset” buttons
    ['frame','reset'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.pointerEvents = 'auto';
            btn.onclick = () => events.fire(`camera.${id}`);
            container.appendChild(btn);
        }
    });
}

window.addEventListener('load', () => initGitHubControls(pc.app));
