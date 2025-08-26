//Chat GPT used for support

(function () {
  const baseH   = 1080;                       // chiều cao thiết kế
  const content = document.querySelector('.v1_2');
  const fixed   = document.querySelector('.v1_19');
  const viewport= document.querySelector('.viewport');
  let   lastScale = 1;

  function fit() {
    const scale = window.innerHeight / baseH;

    // scale cả khung scroll lẫn khối cố định
    content.style.transform = `scale(${scale})`;
    fixed.style.transform   = `scale(${scale})`;

    // Giữ vị trí scroll tương đối khi resize
    const ratio = scale / lastScale;
    viewport.scrollLeft *= ratio;
    lastScale = scale;
  }

  window.addEventListener('load', fit);
  window.addEventListener('resize', fit);
})();

