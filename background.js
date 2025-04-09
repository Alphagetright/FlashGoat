const MW_API_KEY = '2e246e59-2155-4bd9-a37e-6404c39fe7f4';
const MYMEMORY_KEY = '48a0fe6bd34a36b0c892'; // 您的MyMemory API密钥

const API_SOURCES = {
  MYMEMORY_TRANSLATE: {
    endpoint: 'https://api.mymemory.translated.net/get',
    async translate(text) {
      try {
        const response = await fetch(
          `${this.endpoint}?q=${encodeURIComponent(text)}` +
          `&langpair=en|zh` +
          `&key=${MYMEMORY_KEY}`
        );
        const data = await response.json();
        return data.responseData?.translatedText || data.matches?.[0]?.translation || '翻译失败';
      } catch (error) {
        console.error('MyMemory翻译API请求失败:', error);
        return '翻译服务异常';
      }
    }
  },
  
  MERRIAM_WEBSTER: {
    endpoint: (word) => `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`,
    parser: (data) => ({
      definition: data[0]?.shortdef?.[0] || '未找到定义',
      roots: data[0]?.meta?.stems || []
    })
  },
  LOCAL_FALLBACK: {
    endpoint: chrome.runtime.getURL('data/words.json'),
    parser: (data, word) => data[word] || { definition: 'Local data not found' }
  }
};

// MD5 函数实现（可以保留，虽然MyMemory不需要）
function md5(string) {
  // ... 保持原有MD5实现不变 ...
}

const CACHE_TTL = 24 * 3600 * 1000; // 24小时缓存
const requestQueue = new Map();

async function fetchTranslation(text) {
  try {
    // 获取中文翻译（使用MyMemory）
    const chineseTranslation = await API_SOURCES.MYMEMORY_TRANSLATE.translate(text);
    
    // 获取英文释义
    const response = await fetch(API_SOURCES.MERRIAM_WEBSTER.endpoint(text));
    const data = await response.json();
    const englishDefinition = API_SOURCES.MERRIAM_WEBSTER.parser(data);

    return {
      chinese: chineseTranslation,
      english: englishDefinition.definition,
      roots: englishDefinition.roots
    };
  } catch (error) {
    console.error('翻译请求失败:', error);
    return {
      chinese: '翻译失败',
      english: '获取释义失败',
      roots: []
    };
  }
}

// 其余部分保持不变...
async function getCachedTranslation(text) {
  return new Promise(resolve => {
    chrome.storage.local.get(['translationCache'], ({ translationCache = {} }) => {
      const cached = translationCache[text];
      if (cached && Date.now() < cached.expires) {
        resolve(cached.data);
      } else {
        resolve(null);
      }
    });
  });
}

async function updateCache(text, data) {
  const cacheEntry = {
    data,
    expires: Date.now() + CACHE_TTL
  };
  chrome.storage.local.get(['translationCache'], ({ translationCache = {} }) => {
    chrome.storage.local.set({ 
      translationCache: { ...translationCache, [text]: cacheEntry }
    });
  });
}

async function handleTranslateRequest(text) {
  // 先检查缓存
  const cached = await getCachedTranslation(text);
  if (cached) {
    return cached;
  }

  // 如果没有缓存，则发起新请求
  const data = await fetchTranslation(text);
  await updateCache(text, data);
  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translateText') {
    handleTranslateRequest(request.text)
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启
  }
});