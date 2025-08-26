//Chat GPT used for support

document.addEventListener('DOMContentLoaded', () => {
  const viewport = document.querySelector('.viewport');

  viewport.addEventListener('wheel', e => {
    e.preventDefault();               // chặn cuộn dọc
    viewport.scrollLeft += e.deltaY;  // dùng deltaY để cuộn ngang
  }, {passive:false});
});
