/*!
 * colorize-v1_5.js — Generic text highlighter by config
 * - Không cần sửa HTML/CSS hiện tại.
 * - Chỉnh màu/cụm từ/selector ở COLORIZE_CONFIG bên dưới.
 * - Hoạt động trên text node (không phá cấu trúc HTML).
 * - Tránh tô đè lên phần đã highlight bằng data-hl="1".
 */

(() => {
  // === Config: chỉnh ở đây khi muốn áp dụng cho chỗ khác ===
  const COLORIZE_CONFIG = [
    {
      selector: '.v1_5',
      rules: [
        // 🔁 Cập nhật: tô "PEACE," (bao gồm cả dấu phẩy)
        // Trước đây: /\bPEACE\b/gi
        { pattern: /\bPEACE\b,/gi, color: '#67E8B2' },

        // "JUSTICE" -> #AAC1F4
        { pattern: /\bJUSTICE\b/gi, color: '#AAC1F4' },

        // "& STRONG INSTITUTIONS" -> #EB4C58
        // (Trong HTML là &amp; nhưng textContent -> ký tự &)
        { pattern: /&\s*STRONG INSTITUTIONS/gi, color: '#EB4C58' },
      ],
    },

    // ➕ BỔ SUNG CHO .v1_15 (giữ nguyên cấu trúc cũ)
    {
      selector: '.Action_call',
      rules: [
        // "far too high" -> #EB4C58
        { pattern: /\bFAR TOO HIGH\b/gi, color: '#EB4C58' },

        // "grow," -> #67E8B2  (bao gồm dấu phẩy)
        { pattern: /\bGROW\b,/gi, color: '#67E8B2' },

        // "dream," -> #FFDB3C (bao gồm dấu phẩy)
        { pattern: /\bDREAM\b,/gi, color: '#FFDB3C' },

        // "& lead" hoặc "AND LEAD" -> #F169A9
        // (cover cả trường hợp hiện tại đang là "AND LEAD.")
        { pattern: /(?:&\s*|AND\s+)LEAD\b/gi, color: '#F169A9' },
      ],
    },
  ];

  // Lấy tất cả text node dưới một root, bỏ qua những node nằm trong phần đã highlight
  function getTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue;
          if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent && parent.closest('[data-hl="1"]')) {
            return NodeFilter.FILTER_REJECT; // đã highlight trước đó
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // Thay text node bằng fragment có chèn span màu cho mỗi match
  function highlightTextNode(node, regex, color) {
    const text = node.nodeValue;
    regex.lastIndex = 0;

    let match;
    let lastIdx = 0;
    let found = false;

    const frag = document.createDocumentFragment();

    while ((match = regex.exec(text)) !== null) {
      const i = match.index;
      if (i > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, i)));
      }
      const span = document.createElement('span');
      span.setAttribute('data-hl', '1');
      span.style.color = color; // inline style để không cần sửa CSS
      span.textContent = match[0];
      frag.appendChild(span);

      lastIdx = i + match[0].length;
      if (match[0].length === 0) regex.lastIndex++; // an toàn với regex lỡ match rỗng
      found = true;
    }

    if (!found) return false;

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    node.parentNode.replaceChild(frag, node);
    return true;
  }

  function applyRuleToElement(el, rule) {
    const nodes = getTextNodes(el);
    nodes.forEach((node) => {
      highlightTextNode(node, rule.pattern, rule.color);
    });
  }

  function colorize(config) {
    config.forEach((section) => {
      const roots = document.querySelectorAll(section.selector);
      roots.forEach((root) => {
        section.rules.forEach((rule) => applyRuleToElement(root, rule));
      });
    });
  }

  // Tự chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => colorize(COLORIZE_CONFIG));
  } else {
    colorize(COLORIZE_CONFIG);
  }

  // API nhỏ để bạn có thể gọi lại sau (ví dụ sau khi đổi config runtime)
  window.ColorizeV15 = {
    run: (cfg) => colorize(cfg || COLORIZE_CONFIG),
    config: COLORIZE_CONFIG,
  };
})();
