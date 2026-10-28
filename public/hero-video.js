const video=document.querySelector('#hero-video');
const toggle=document.querySelector('#hero-video-toggle');
if(video&&toggle){
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{toggle.textContent=video.paused?'Reproducir video':'Pausar video';};
  toggle.hidden=false;
  video.addEventListener('play',update);
  video.addEventListener('pause',update);
  video.addEventListener('error',()=>{toggle.hidden=true;});
  toggle.addEventListener('click',async()=>{if(video.paused){try{await video.play();}catch{update();}}else video.pause();});
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)video.pause();});
  if(!reducedMotion.matches&&!navigator.connection?.saveData)video.play().catch(update);
}
