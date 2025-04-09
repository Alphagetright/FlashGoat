// 样式注入
const style = document.createElement('style');
style.textContent = `
  .ew-word {
    display: inline-block !important;
    padding: 2px 4px !important;
    margin: 0 2px !important;
    border: 1px solid transparent !important;
    border-radius: 3px !important;
    cursor: pointer !important;
    transition: all 0.3s ease !important;
    position: relative !important;
    z-index: 9999 !important;
  }
  
  .ew-word:hover {
    background-color: rgba(64, 158, 255, 0.1) !important;
    border-color: #409EFF !important;
  }

  .ew-tooltip {
    position: fixed;
    z-index: 9999;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    padding: 12px;
    max-width: 300px;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
  }

  .ew-tooltip-title {
    font-weight: bold;
    margin-bottom: 8px;
    color: #409EFF;
  }

  .ew-tooltip-chinese {
    color: #67C23A;
    margin-bottom: 8px;
    font-size: 16px;
  }

  .ew-tooltip-english {
    color: #666;
    font-size: 13px;
    border-top: 1px solid #eee;
    padding-top: 8px;
    margin-top: 8px;
  }

  .ew-loading {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #409EFF;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .ew-ocr-button {
    position: fixed;
    right: 20px;
    bottom: 20px;
    background: #409EFF;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    z-index: 10000;
    font-size: 14px;
    display: none;
  }

  .ew-ocr-button:hover {
    background: #66b1ff;
  }

  .ew-ocr-button.active {
    display: block;
  }

  .ew-subtitle-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
  }

  .ew-ocr-result {
    position: fixed;
    right: 20px;
    bottom: 80px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    padding: 16px;
    max-width: 300px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 10000;
  }

  .ew-ocr-word {
    margin: 8px 0;
    padding: 8px;
    border-radius: 4px;
    background: #f5f7fa;
    cursor: pointer;
  }

  .ew-ocr-word:hover {
    background: #ecf5ff;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// 添加OCR按钮
const ocrButton = document.createElement('button');
ocrButton.className = 'ew-ocr-button';
ocrButton.textContent = '识别字幕';
document.body.appendChild(ocrButton);

// OCR状态和配置
let isOCRActive = false;
let currentVideo = null;
let lastOCRText = ''; // 缓存上一次识别的文本
let lastOCRTime = 0; // 上一次OCR的时间戳
const OCR_INTERVAL = 3000; // OCR间隔时间(ms)
const OCR_MIN_DIFF = 0.3; // 最小图像差异阈值

// 检测视频并显示OCR按钮
function checkForVideo() {
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    currentVideo = videos[0];
    ocrButton.classList.add('active');
    setupVideoEvents();
  } else {
    ocrButton.classList.remove('active');
    currentVideo = null;
  }
}

// 设置视频事件监听
function setupVideoEvents() {
  if (!currentVideo) return;
  
  // 视频暂停时停止OCR
  currentVideo.addEventListener('pause', () => {
    isOCRActive = false;
    ocrButton.textContent = '识别字幕';
  });

  // 视频播放时恢复OCR
  currentVideo.addEventListener('play', () => {
    if (ocrButton.textContent === '停止识别') {
      isOCRActive = true;
      startOCR();
    }
  });
}

// 图像相似度比较
function getImageDifference(canvas1, canvas2) {
  const ctx1 = canvas1.getContext('2d');
  const ctx2 = canvas2.getContext('2d');
  const data1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height).data;
  const data2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height).data;
  
  let diff = 0;
  for (let i = 0; i < data1.length; i += 4) {
    diff += Math.abs(data1[i] - data2[i]); // 只比较灰度值
  }
  
  return diff / (data1.length / 4) / 255;
}

// 优化的视频帧捕获
async function captureVideoFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = Math.floor(video.videoHeight * 0.2); // 只截取底部20%区域
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    video,
    0, Math.floor(video.videoHeight * 0.8), // 从底部20%开始
    video.videoWidth, Math.floor(video.videoHeight * 0.2),
    0, 0,
    canvas.width, canvas.height
  );
  
  // 图像预处理
  ctx.filter = 'contrast(1.2) brightness(1.1)'; // 增加对比度和亮度
  ctx.drawImage(canvas, 0, 0);
  
  return canvas;
}

// OCR处理流程
async function processVideoOCR() {
  if (!currentVideo || !isOCRActive) return;
  
  try {
    const now = Date.now();
    if (now - lastOCRTime < OCR_INTERVAL) return; // 控制识别频率
    
    const canvas = await captureVideoFrame(currentVideo);
    
    // 检查图像是否有明显变化
    if (window._lastCanvas) {
      const diff = getImageDifference(canvas, window._lastCanvas);
      if (diff < OCR_MIN_DIFF) return; // 图像变化不大，跳过识别
    }
    window._lastCanvas = canvas;
    
    const imageData = canvas.toDataURL('image/png');
    const response = await chrome.runtime.sendMessage({
      action: 'performOCR',
      imageData
    });
    
    if (response.success && response.translations.length > 0) {
      // 避免重复显示相同内容
      if (response.text !== lastOCRText) {
        const resultPanel = createOCRResultPanel();
        displayOCRResults(response.translations, resultPanel);
        
        // 移除旧面板
        const oldPanel = document.querySelector('.ew-ocr-result');
        if (oldPanel) oldPanel.remove();
        
        document.body.appendChild(resultPanel);
        lastOCRText = response.text;
      }
    }
    
    lastOCRTime = now;
  } catch (error) {
    console.error('OCR处理失败:', error);
    isOCRActive = false;
    ocrButton.textContent = '识别字幕';
  }
}

// 启动OCR识别
function startOCR() {
  if (!currentVideo || !isOCRActive) return;
  
  processVideoOCR();
  requestAnimationFrame(() => {
    if (isOCRActive) {
      startOCR();
    }
  });
}

// OCR按钮点击事件
ocrButton.addEventListener('click', () => {
  if (!currentVideo) return;
  
  isOCRActive = !isOCRActive;
  ocrButton.textContent = isOCRActive ? '停止识别' : '识别字幕';
  
  if (isOCRActive) {
    lastOCRText = '';
    lastOCRTime = 0;
    if (window._lastCanvas) {
      delete window._lastCanvas;
    }
    startOCR();
  } else {
    const resultPanel = document.querySelector('.ew-ocr-result');
    if (resultPanel) {
      resultPanel.remove();
    }
  }
});

// 创建字幕结果显示区域
function createOCRResultPanel() {
  const panel = document.createElement('div');
  panel.className = 'ew-ocr-result';
  return panel;
}

// 处理OCR结果
function displayOCRResults(results, panel) {
  panel.innerHTML = '';
  results.forEach(({ word, translation }) => {
    const wordElement = document.createElement('div');
    wordElement.className = 'ew-ocr-word';
    wordElement.innerHTML = `
      <div class="ew-tooltip-title">${word}</div>
      <div class="ew-tooltip-chinese">${translation.chinese}</div>
    `;
    wordElement.addEventListener('click', () => {
      const { clientX, clientY } = wordElement.getBoundingClientRect();
      showTranslation(word, translation, clientX, clientY);
    });
    panel.appendChild(wordElement);
  });
}

// 工具函数
function isEnglishWord(text) {
  return /^[a-zA-Z]+$/i.test(text);
}

function createTooltip(word, translation, x, y) {
  const tooltip = document.createElement('div');
  tooltip.className = 'ew-tooltip';
  tooltip.innerHTML = `
    <div class="ew-tooltip-title">${word}</div>
    <div class="ew-tooltip-chinese">${translation.chinese}</div>
    <div class="ew-tooltip-english">${translation.english}</div>
  `;
  
  // 确保tooltip不会超出屏幕
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  let left = x;
  let top = y + 20;
  
  if (left + 300 > viewportWidth) {
    left = viewportWidth - 310;
  }
  if (top + tooltip.offsetHeight > viewportHeight) {
    top = y - tooltip.offsetHeight - 10;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  
  return tooltip;
}

function showLoadingTooltip(x, y) {
  const tooltip = document.createElement('div');
  tooltip.className = 'ew-tooltip';
  tooltip.innerHTML = '<div class="ew-loading"></div>';
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y + 20}px`;
  document.body.appendChild(tooltip);
  return tooltip;
}

// 性能优化：使用WeakMap来缓存已处理的节点
const processedNodes = new WeakMap();

// 处理文本节点
function processTextNode(textNode) {
  if (processedNodes.has(textNode)) return;
  
  const parentNode = textNode.parentNode;
  if (!parentNode) return;
  
  const parentTag = parentNode.tagName;
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || 
      parentTag === 'TEXTAREA' || parentTag === 'INPUT' ||
      parentTag === 'PRE' || parentTag === 'CODE' ||
      parentTag === 'SPAN' && parentNode.classList.contains('ew-word')) {
    return;
  }

  const text = textNode.textContent.trim();
  if (!text || text.length < 2) return;

  if (!/[a-zA-Z]/.test(text)) return;

  const words = text.split(/([a-zA-Z]+|[^a-zA-Z\s]+|\s+)/g).filter(Boolean);
  if (words.length <= 1) return;

  const hasEnglishWord = words.some(isEnglishWord);
  if (!hasEnglishWord) return;

  const span = document.createElement('span');
  span.innerHTML = words.map(word => {
    return isEnglishWord(word) ? 
      `<span class="ew-word">${word}</span>` : 
      word;
  }).join('');

  textNode.parentNode.replaceChild(span, textNode);
  processedNodes.set(textNode, true);
}

// 使用 IntersectionObserver 处理可见内容
const observeIntersection = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      processContent(entry.target);
      observeIntersection.unobserve(entry.target);
    }
  });
}, {
  rootMargin: '100px'
});

// 处理页面内容
function processContent(root) {
  if (!root || processedNodes.has(root)) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!node.textContent.trim() || processedNodes.has(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  // 批量处理节点
  if (nodes.length > 0) {
    requestIdleCallback(() => {
      nodes.forEach(processTextNode);
    });
  }

  processedNodes.set(root, true);
}

// 初始化标志
let isInitialized = false;
let subtitleObserver = null;

// 初始化函数
function initialize() {
  if (isInitialized) return;
  isInitialized = true;

  console.log('初始化扩展...');

  // 处理可见区域的内容
  const visibleElements = document.querySelectorAll('p, div, article, section');
  visibleElements.forEach(element => {
    observeIntersection.observe(element);
  });

  // 设置字幕观察器
  setupSubtitleObserver();

  // 每2秒检查一次新的字幕容器
  setInterval(checkForNewSubtitles, 2000);
}

// 检查新的字幕容器
function checkForNewSubtitles() {
  const subtitleSelectors = [
    '.vjs-text-track-display',
    '.ytp-caption-window-container',
    '.player-timedtext',
    '.bilibili-player-video-subtitle',
    '[class*="subtitle"]',
    '[class*="caption"]',
    '.video-subtitle',
    '.video-caption',
    '.subtitle-text',
    '.caption-text'
  ];

  subtitleSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      if (!processedNodes.has(element)) {
        console.log('发现新的字幕容器:', selector);
        processSubtitleContainer(element);
        if (subtitleObserver) {
          subtitleObserver.observe(element, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
          });
        }
      }
    });
  });
}

// 处理字幕容器
function processSubtitleContainer(container) {
  console.log('处理字幕容器:', container);
  
  // 处理现有的字幕文本
  const textNodes = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    if (!processedNodes.has(node)) {
      processTextNode(node);
    }
  });

  // 处理字幕元素
  container.querySelectorAll('*').forEach(element => {
    if (!processedNodes.has(element) && isSubtitleElement(element)) {
      processSubtitleElement(element);
    }
  });
}

// 处理字幕元素
function processSubtitleElement(element) {
  if (processedNodes.has(element)) return;
  console.log('处理字幕元素:', element.textContent);

  const text = element.textContent.trim();
  if (!text || text.length < 2) return;

  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(text)) return;

  // 分词处理
  const words = text.split(/([a-zA-Z]+|[^a-zA-Z\s]+|\s+)/g).filter(Boolean);
  if (words.length <= 1) return;

  // 检查是否有英文单词
  const hasEnglishWord = words.some(isEnglishWord);
  if (!hasEnglishWord) return;

  // 创建新的包装元素
  const wrapper = document.createElement('span');
  wrapper.style.cssText = `
    display: inline-block !important;
    width: 100% !important;
    color: inherit !important;
    background: inherit !important;
    font-size: inherit !important;
  `;
  
  wrapper.innerHTML = words.map(word => {
    if (isEnglishWord(word)) {
      return `<span class="ew-word" data-word="${word}">${word}</span>`;
    }
    return word;
  }).join('');

  // 保持原有样式
  const computedStyle = window.getComputedStyle(element);
  const stylesToCopy = ['color', 'background-color', 'font-size', 'font-family', 'line-height'];
  stylesToCopy.forEach(style => {
    wrapper.style[style] = computedStyle[style];
  });

  // 替换内容
  element.innerHTML = '';
  element.appendChild(wrapper);
  processedNodes.set(element, true);
}

// 设置字幕观察器
function setupSubtitleObserver() {
  if (subtitleObserver) {
    subtitleObserver.disconnect();
  }

  console.log('设置字幕观察器');

  subtitleObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      console.log('检测到字幕变化:', mutation.type);
      
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (isSubtitleElement(node)) {
              processSubtitleElement(node);
            }
            processContent(node);
          }
        });
      } else if (mutation.type === 'characterData') {
        processTextNode(mutation.target);
      }
    });
  });

  // 立即处理现有的字幕
  checkForNewSubtitles();
}

// 判断是否为字幕元素
function isSubtitleElement(element) {
  if (!element || !element.className) return false;

  const subtitleClasses = [
    'subtitle',
    'caption',
    'srt',
    'player-timedtext',
    'video-subtitle'
  ];
  
  const elementClasses = element.className.toLowerCase();
  const elementId = element.id ? element.id.toLowerCase() : '';
  
  return subtitleClasses.some(className => 
    elementClasses.includes(className) ||
    elementId.includes(className)
  );
}

// 确保初始化
if (document.readyState === 'complete') {
  initialize();
} else {
  window.addEventListener('load', initialize);
}

// 监听动态内容
const contentObserver = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (!processedNodes.has(node)) {
          if (isSubtitleElement(node)) {
            processSubtitleElement(node);
          }
          observeIntersection.observe(node);
        }
      }
    });
  });
});

contentObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// 当前显示的tooltip
let currentTooltip = null;

// 处理点击事件
document.addEventListener('click', async (e) => {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }

  if (!e.target.classList.contains('ew-word')) {
    return;
  }

  const word = e.target.textContent;
  const { clientX: x, clientY: y } = e;

  const loadingTooltip = showLoadingTooltip(x, y);
  currentTooltip = loadingTooltip;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translateText',
      text: word
    });

    loadingTooltip.remove();

    if (response.success) {
      const tooltip = createTooltip(word, response.data, x, y);
      document.body.appendChild(tooltip);
      currentTooltip = tooltip;
    } else {
      const tooltip = createTooltip(word, {
        chinese: '获取释义失败',
        english: '服务出错'
      }, x, y);
      document.body.appendChild(tooltip);
      currentTooltip = tooltip;
    }
  } catch (error) {
    loadingTooltip.remove();
    const tooltip = createTooltip(word, {
      chinese: '服务出错',
      english: error.message
    }, x, y);
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
  }
});

