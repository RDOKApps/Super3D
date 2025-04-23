// controls.js
import { Events } from './src/events.js';
import { Tooltips } from './src/ui/tooltips.js';
import { ModeToggle } from './src/ui/mode-toggle.js';    // 
import { ViewCube }  from './src/ui/view-cube.js';      // 

// This function replaces the default HTML controls with the GitHub viewer controls:
export function initGitHubControls(app) {
  const events   = new Events();
  const tooltips = new Tooltips();

  // 1. Hide the built-in controls
  const defaultUI = document.getElementById('controlsWrap');
  if (defaultUI) defaultUI.style.display = 'none';

  // 2. Create a container for our custom widgets
  const container = document.createElement('div');
  container.id = 'github-controls';
  Object.assign(container.style, {
    position:     'absolute',
    bottom:       '10px',
    right:        '10px',
    pointerEvents:'none',  // let pointer events bubble through to the canvas
    zIndex:       1000
  });
  document.body.appendChild(container);

  // 3. Instantiate the mode toggle (Orbit / Fly)
  new ModeToggle(events, tooltips, { parent: container });

  // 4. Instantiate the view cube (the little 3D orientation widget)
  const viewCube = new ViewCube(events, { parent: container });

  // update the view cube each frame
  app.on('update', () => {
    // get the camera’s view matrix
    const camEntity = app.root.findByName('camera');
    const viewMat   = camEntity.script.camera.entity.getViewMatrix();
    viewCube.update(viewMat);
  });

  // 5. Add Frame & Reset buttons (they already exist in your HTML, but we re-parent them)
  ['frame','reset'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.pointerEvents = 'auto';
      btn.onclick = () => events.fire(`camera.${id}`);
      container.appendChild(btn);
    }
  });
}

// Initialize on load
window.addEventListener('load', () => {
  // pc.app is your PlayCanvas Application instance
  initGitHubControls(pc.app);
});
