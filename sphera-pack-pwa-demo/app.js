const worlds = [
  './exhibits/sphere-gice/sphere-gice-melody-v2-v3.3.html',
  './exhibits/builders/spherai-voxel-64.html',
  './exhibits/builders/sm7-goose-cube-workbook.html',
  './exhibits/sheet_cube_gice.html',
  './exhibits/zooter/zooter_clean.html',
  './exhibits/goose/octave.gice.html',
  './exhibits/hanzi/hanzi_gravity_sim.html',
  './exhibits/goose-crossing/index.html'
];

const toast = document.querySelector('#toast');
const say = message => {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
};

document.querySelector('#random-button').addEventListener('click', () => {
  location.href = worlds[Math.floor(Math.random() * worlds.length)];
});

const network = document.querySelector('#network-status');
const updateNetwork = () => {
  network.textContent = navigator.onLine ? 'SYSTEM ONLINE' : 'OFFLINE MODE';
  document.querySelector('.pulse').style.background = navigator.onLine ? 'var(--mint)' : 'var(--warm)';
};
window.addEventListener('online', () => { updateNetwork(); say('CONNECTION RESTORED'); });
window.addEventListener('offline', () => { updateNetwork(); say('FIELD STATION IS OFFLINE'); });
updateNetwork();

let installPrompt;
const installButton = document.querySelector('#install-button');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') say('FIELD STATION INSTALLED');
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => say('READY FOR OFFLINE EXPLORATION'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error('Service worker registration failed', error);
    }
  });
}
