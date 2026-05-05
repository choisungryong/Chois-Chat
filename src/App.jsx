import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plus, User, Bot, Paperclip, X, Square, Trash2, MessageSquare, Copy, Check, FileText, Search } from 'lucide-react';
import './index.css';

const MODELS = [
  { id: 'auto', name: 'Auto (최적화)', desc: '비용 대비 성능 자동 조절' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', desc: '빠르고 저렴한 처리' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Pro', desc: '복잡한 논리 및 시각 분석' },
  { id: 'gpt-5.5', name: 'GPT-5.5', desc: '최신 플래그십 모델 (에이전트/복잡 작업)' },
  { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', desc: '최고 수준 추론 및 정밀 응답' }
];

// 모델별 컨텍스트 윈도우 크기 (토큰 수)
const CONTEXT_WINDOWS = {
  'auto':        128000,
  'gpt-5.4-mini': 128000,
  'gpt-5.4':     128000,
  'gpt-5.5':     200000,
  'gpt-5.5-pro': 200000,
};

// 한/영 혼합 토큰 추정 (한글 1자 ≈ 1.5토큰, 영어 4자 ≈ 1토큰)
const estimateTokens = (text) => {
  if (!text) return 0;
  let ascii = 0, nonAscii = 0;
  for (let i = 0; i < text.length; i++) {
    text.charCodeAt(i) <= 127 ? ascii++ : nonAscii++;
  }
  return Math.round((ascii / 4) + (nonAscii * 1.5));
};

const getMsgText = (content) =>
  Array.isArray(content) ? content.map(c => c.text || '').join(' ') : (content || '');

// 채팅의 총 토큰 수 계산
const calcChatTokens = (chat) => {
  if (!chat?.messages?.length) return 0;
  return chat.messages.reduce((sum, msg) => sum + estimateTokens(getMsgText(msg.content)), 0);
};

// 토큰 수를 보기 좋은 문자열로 포맷 (예: 4200 → "4.2K")
const fmtTokens = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

// 사용률에 따른 색상 (초록/노랑/빨강)
const tokenBarColor = (pct) => {
  if (pct >= 85) return '#ef4444';
  if (pct >= 55) return '#f59e0b';
  return '#10a37f';
};

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const text = String(children).replace(/\n$/, '');

  const copyCode = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-lang">{match ? match[1] : 'text'}</span>
          <button className="code-copy-btn" onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className={className}>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

// ─── 메시지 버블 (메모이제이션으로 타이핑 시 불필요한 리렌더 방지) ───
const MessageBubble = memo(({ msg, index, copiedIndex, onCopy, isHighlighted }) => {
  const getTextContent = (content) =>
    Array.isArray(content) ? content.map(c => c.text || '').join('\n') : content;

  return (
    <div
      id={`msg-${index}`}
      className={`message-row ${msg.role === 'assistant' ? 'ai' : 'user'}${isHighlighted ? ' msg-highlight' : ''}`}
    >
      <div className="message-content">
        <div className={`avatar ${msg.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}`}>
          {msg.role === 'assistant' ? <Bot size={20} color="white" /> : <User size={20} color="white" />}
        </div>
        <div className="text-container">
          {msg.role === 'assistant' && (
            <div className="message-actions top-actions">
              <button
                className="action-btn"
                onClick={() => onCopy(getTextContent(msg.content), index)}
                title={copiedIndex === index ? '복사됨!' : '복사'}
              >
                {copiedIndex === index ? (
                  <><Check size={14} className="copied-icon" /> <span className="copied-text">복사됨!</span></>
                ) : (
                  <><Copy size={14} /> <span>위에서 복사</span></>
                )}
              </button>
            </div>
          )}

          <div className="text">
            {Array.isArray(msg.content) ? (
              msg.content.map((c, j) => (
                <div key={j}>
                  {c.type === 'text' && <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{c.text}</ReactMarkdown>}
                  {c.type === 'image_url' && <img src={c.image_url.url} alt="Uploaded" className="chat-img" />}
                </div>
              ))
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>{msg.content}</ReactMarkdown>
            )}
          </div>

          {msg.role === 'assistant' && (
            <div className="message-actions bottom-actions">
              <button
                className="action-btn"
                onClick={() => onCopy(getTextContent(msg.content), index)}
                title={copiedIndex === index ? '복사됨!' : '복사'}
              >
                {copiedIndex === index ? (
                  <><Check size={14} className="copied-icon" /> <span className="copied-text">복사됨!</span></>
                ) : (
                  <><Copy size={14} /> <span>아래서 복사</span></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── 검색 패널 컴포넌트 ───────────────────────────────────────
const SearchPanel = memo(({ chats, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // 패널 열리면 자동 포커스
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const getTextContent = (content) =>
    Array.isArray(content) ? content.map(c => c.text || '').join(' ') : (content || '');

  const results = query.trim().length < 1 ? [] : (() => {
    const q = query.trim().toLowerCase();
    const found = [];
    chats.forEach(chat => {
      chat.messages.forEach((msg, msgIdx) => {
        const text = getTextContent(msg.content);
        const idx = text.toLowerCase().indexOf(q);
        if (idx !== -1) {
          found.push({
            chatId: chat.id,
            chatTitle: chat.title,
            msgIdx,
            role: msg.role,
            text,
            matchStart: idx,
            matchEnd: idx + q.length,
          });
        }
      });
    });
    return found;
  })();

  const highlight = (text, start, end) => {
    const MAX = 140;
    // excerpt 범위: match 앞뒤 60자
    const from = Math.max(0, start - 60);
    const to = Math.min(text.length, end + 80);
    const excerpt = text.slice(from, to);
    const relStart = start - from;
    const relEnd = end - from;
    const before = excerpt.slice(0, relStart);
    const match = excerpt.slice(relStart, relEnd);
    const after = excerpt.slice(relEnd, MAX);
    return { before: (from > 0 ? '…' : '') + before, match, after: after + (to < text.length ? '…' : '') };
  };

  return (
    <div className="search-panel" role="dialog" aria-modal="true">
      <div className="search-panel-backdrop" onClick={onClose} />
      <div className="search-panel-box">
        <div className="search-panel-header">
          <Search size={18} className="search-panel-icon" />
          <input
            ref={inputRef}
            className="search-panel-input"
            placeholder="전체 대화에서 검색..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
          />
          <button className="search-panel-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="search-results">
          {query.trim().length === 0 && (
            <div className="search-empty">검색어를 입력하면 모든 대화를 탐색합니다.</div>
          )}
          {query.trim().length > 0 && results.length === 0 && (
            <div className="search-empty">'{query}' 에 대한 결과가 없습니다.</div>
          )}
          {results.map((r, i) => {
            const { before, match, after } = highlight(r.text, r.matchStart, r.matchEnd);
            return (
              <button
                key={i}
                className="search-result-item"
                onClick={() => { onSelect(r.chatId, r.msgIdx); onClose(); }}
              >
                <div className="search-result-meta">
                  <MessageSquare size={13} />
                  <span className="search-result-chat">{r.chatTitle}</span>
                  <span className="search-result-role">{r.role === 'user' ? '나' : 'AI'}</span>
                </div>
                <div className="search-result-excerpt">
                  <span className="search-excerpt-plain">{before}</span>
                  <span className="search-excerpt-match">{match}</span>
                  <span className="search-excerpt-plain">{after}</span>
                </div>
              </button>
            );
          })}
        </div>

        {results.length > 0 && (
          <div className="search-result-count">{results.length}개 결과</div>
        )}
      </div>
    </div>
  );
});

function App() {
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem('chois-chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('chois-selected-model') || 'auto';
  });
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(null); // { msgIdx } — 하이라이트 대상
  // 모바일 환경(768px 이하)이면 최초 접속 시 닫힌 상태로 시작
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);
  const [storyBible, setStoryBible] = useState(() => {
    return localStorage.getItem('chois-story-bible') || '';
  });
  const [isStoryBibleOpen, setIsStoryBibleOpen] = useState(false);
  const [masterPrompt, setMasterPrompt] = useState(() => {
    return localStorage.getItem('chois-master-prompt') || '';
  });
  const [isMasterPromptOpen, setIsMasterPromptOpen] = useState(false);
  const BUDGET = 204.13; // Total deposit amount

  // Local usage tracking persisted to localStorage
  const [totalSpent, setTotalSpent] = useState(() => {
    return parseFloat(localStorage.getItem('chois-total-spent') || '0');
  });

  // 실제 OpenAI 잔여 크레딧 조회
  const [realBalance, setRealBalance] = useState(null);   // null = 미조회
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(null);

  const fetchBalance = async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const res = await fetch('/api/balance');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRealBalance(data.total_available);
    } catch (e) {
      setBalanceError(e.message);
    } finally {
      setBalanceLoading(false);
    }
  };

  // Model pricing per 1M tokens (OpenAI 공식 기준 추정치)
  const MODEL_PRICING = {
    'gpt-5.4-mini': { input: 0.15,  output: 0.60  },
    'gpt-5.4':      { input: 2.50,  output: 10.00 },
    'gpt-5.5':      { input: 5.00,  output: 20.00 },
    'gpt-5.5-pro':  { input: 15.00, output: 60.00 },
  };

  // Add cost from a completed response (한국어 특성 반영된 근사 토큰 계산)
  const trackCost = (inputText, outputText, model) => {
    const prices = MODEL_PRICING[model] || MODEL_PRICING['gpt-5.4-mini'];
    
    // 단순 글자수/4 가 아닌, 한글(비Ascii)은 1.5토큰, 영어는 4자당 1토큰으로 현실화 (요금 추적 오차율 축소)
    const estimateTokens = (text) => {
      if (!text) return 0;
      let asciiCount = 0;
      let nonAsciiCount = 0;
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) <= 127) asciiCount++;
        else nonAsciiCount++;
      }
      return (asciiCount / 4) + (nonAsciiCount * 1.5);
    };

    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);

    const cost = (inputTokens / 1_000_000) * prices.input
               + (outputTokens / 1_000_000) * prices.output;
               
    setTotalSpent(prev => {
      const next = prev + cost;
      localStorage.setItem('chois-total-spent', next.toString());
      return next;
    });
  };

  // Persist model selection
  useEffect(() => {
    localStorage.setItem('chois-selected-model', selectedModel);
  }, [selectedModel]);

  // Persist story bible
  useEffect(() => {
    localStorage.setItem('chois-story-bible', storyBible);
  }, [storyBible]);

  // Persist master prompt
  useEffect(() => {
    localStorage.setItem('chois-master-prompt', masterPrompt);
  }, [masterPrompt]);

  // Persistent storage for chats (최초 로딩 시 자동 선택 없음 - 새 대화로 시작)
  useEffect(() => {
    localStorage.setItem('chois-chats', JSON.stringify(chats));
  }, [chats]);



  // 대화 전환 시 스크롤 맨 아래로 및 로딩 초기화
  useEffect(() => {
    if (!currentChatId) return;

    // 다른 대화방으로 넘어오면 진행 중이던 스트리밍 중지 & 입력창 활성화 (프리징 방지)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);

    // setTimeout으로 DOM이 렌더된 후 스크롤
    const timer = setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [currentChatId]);

  // 사용자가 스크롤을 올려서 읽는 중인지 감지하는 상태
  const [isUserScrollingUp, setIsUserScrollingUp] = useState(false);

  // 스트리밍 중 새 메시지 올 때마다 스크롤 유지
  useEffect(() => {
    if (!chatContainerRef.current || !currentChatId) return;
    const el = chatContainerRef.current;
    
    // 만약 사용자가 일부러 스크롤을 위로 올렸다면 자동 스크롤하지 않음
    if (isUserScrollingUp) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chats, isUserScrollingUp, currentChatId]);

  // 스크롤 이벤트 감지
  const handleScroll = (e) => {
    const el = e.target;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    // 바닥 근처면 '사용자가 올린 상태'를 해제하고 자동 스크롤 켬
    setIsUserScrollingUp(!isNearBottom);
  };

  const handleCopy = useCallback((text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const messages = currentChat ? currentChat.messages : [];

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const SUPPORTED_DOC_TYPES = [
    'text/plain', 'text/csv', 'text/markdown',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
  ];

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (SUPPORTED_IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/')) {
        // 이미지: base64 Data URL로 읽기
        const reader = new FileReader();
        reader.onloadend = () => {
          setAttachments(prev => [...prev, {
            kind: 'image',
            file,
            name: file.name,
            preview: reader.result
          }]);
        };
        reader.readAsDataURL(file);
      } else if (SUPPORTED_DOC_TYPES.includes(file.type) || file.name.match(/\.(txt|md|csv|json|pdf|docx?|xlsx?|pptx?)$/i)) {
        // 문서: 텍스트로 읽기 (PDF/DOCX는 원문 그대로 전달 — 실용적 텍스트 추출)
        const reader = new FileReader();
        reader.onloadend = () => {
          setAttachments(prev => [...prev, {
            kind: 'document',
            file,
            name: file.name,
            mimeType: file.type,
            text: reader.result,
            preview: null
          }]);
        };
        // 텍스트로 읽을 수 있는 파일만 readAsText, 바이너리(PDF/DOCX)는 base64
        const textReadable = file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json)$/i);
        if (textReadable) {
          reader.readAsText(file, 'UTF-8');
        } else {
          // PDF/DOCX: base64로 읽어서 서버에 전달 (현재는 파일명+사이즈 안내로 fallback)
          reader.onloadend = () => {
            setAttachments(prev => [...prev, {
              kind: 'document',
              file,
              name: file.name,
              mimeType: file.type,
              text: `[첨부 파일: ${file.name} (${(file.size / 1024).toFixed(1)} KB) — 바이너리 형식으로 텍스트 추출이 제한됩니다. 파일 내용을 직접 붙여넣기 하시면 더 정확한 분석이 가능합니다.]`,
              preview: null
            }]);
          };
          reader.readAsArrayBuffer(file);
        }
      } else {
        alert(`지원하지 않는 파일 형식입니다: ${file.name}\n지원: 이미지, TXT, MD, CSV, JSON, PDF, DOCX, XLSX`);
      }
    });
    e.target.value = null;
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const startNewChat = () => {
    const newId = Date.now().toString();
    const newChat = {
      id: newId,
      title: '새로운 대화',
      messages: [],
      model: selectedModel,
      timestamp: Date.now()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newId);
    setAttachments([]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto'; // 새 대화 시 입력창 크기 리셋
    
    // 모바일이면 햄버거 메뉴 자동 닫기
    if (window.innerWidth <= 768) setIsSidebarOpen(false);
  };

  const deleteChat = (e, id) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) setCurrentChatId(null);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    let chatId = currentChatId;
    if (!chatId) {
      const newId = Date.now().toString();
      const newChat = {
        id: newId,
        title: input.trim().substring(0, 20) || '새로운 대화',
        messages: [],
        model: selectedModel,
        timestamp: Date.now()
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(newId);
      chatId = newId;
    }

    abortControllerRef.current = new AbortController();
    
    let content = [];
    if (input.trim()) content.push({ type: 'text', text: input });
    attachments.forEach(att => {
      if (att.kind === 'image') {
        content.push({ type: 'image_url', image_url: { url: att.preview } });
      } else if (att.kind === 'document') {
        content.push({
          type: 'text',
          text: `\n---\n📄 첨부 파일: **${att.name}**\n\n${att.text}\n---\n`
        });
      }
    });

    const userMessage = { role: 'user', content };
    const updatedUserMessages = [...messages, userMessage];
    
    // Update local state and title if first message
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        return { 
          ...c, 
          messages: updatedUserMessages,
          title: c.messages.length === 0 ? (input.trim().substring(0, 20) || (attachments.some(a => a.kind === 'document') ? '📄 문서 분석' : '🖼️ 이미지 대화')) : c.title
        };
      }
      return c;
    }));

    // 에러 발생 시 복구를 위해 입력값 백업
    const backupInput = input;
    const backupAttachments = [...attachments];

    setInput('');
    setAttachments([]);
    setIsLoading(true);
    setIsUserScrollingUp(false); // 전송 시 무조건 조준을 맨 밑으로 초기화

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: updatedUserMessages,
          model: selectedModel,
          storyBible: storyBible,
          masterPrompt: masterPrompt
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';
      let buffer = '';

      // Initialize AI message
      setChats(prev => prev.map(c => 
        c.id === chatId ? { ...c, messages: [...c.messages, { role: 'assistant', content: '' }] } : c
      ));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Find all complete SSE events (separated by newline)
        let parts = buffer.split('\n');
        buffer = parts.pop() || ''; // Keep the incomplete line

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          
          const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              aiContent += content;
              // Functional update for precise state management
              setChats(currentChats => currentChats.map(c => {
                if (c.id === chatId) {
                  const newMsgs = [...c.messages];
                  const lastIdx = newMsgs.length - 1;
                  if (newMsgs[lastIdx]) {
                    newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: aiContent };
                  }
                  return { ...c, messages: newMsgs };
                }
                return c;
              }));
            }
          } catch (e) {
            // If parse fails, it might be a split JSON string within a data line
          }
        }
      }
      // Track estimated cost after stream completes
      const fullInputText = JSON.stringify(updatedUserMessages) + (storyBible || '') + (masterPrompt || '');
      trackCost(fullInputText, aiContent, selectedModel === 'auto'
        ? ((fullInputText.length > 30000 || attachments.length > 0) ? 'gpt-5.4' : 'gpt-5.4-mini')
        : selectedModel
      );
    } catch (error) {
      if (error.name !== 'AbortError') {
        // 오류 발생 시 작성했던 글 복구
        setInput(backupInput);
        setAttachments(backupAttachments);
        if (textareaRef.current) {
          setTimeout(() => {
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
          }, 10);
        }

        setChats(prev => prev.map(c => {
          if (c.id === chatId) {
            return { ...c, messages: [...c.messages, { role: 'assistant', content: '🚨 통신 오류: 답변 생성에 실패하여 전송된 글을 복구했습니다. (' + error.message + ')' }] };
          }
          return c;
        }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 전역 Ctrl+K 단축키로 검색 패널 토글
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <button className="new-chat-btn" onClick={startNewChat}>
          <Plus size={18} />
          <span>새 채팅</span>
        </button>
        <div className="chat-history">
          {chats.map(chat => {
            const usedTokens = calcChatTokens(chat);
            const maxTokens = CONTEXT_WINDOWS[chat.model] || 128000;
            const pct = Math.min(100, (usedTokens / maxTokens) * 100);
            const barColor = tokenBarColor(pct);
            const modelLabel = MODELS.find(m => m.id === chat.model)?.name || 'Auto';
            return (
              <div
                key={chat.id}
                className={`history-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentChatId(chat.id);
                  if (window.innerWidth <= 768) setIsSidebarOpen(false);
                }}
              >
                <div className="history-item-top">
                  <MessageSquare size={16} className="history-icon" />
                  <span className="history-title">{chat.title}</span>
                  <button
                    className="delete-chat-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChats(chats.filter(c => c.id !== chat.id));
                      if (currentChatId === chat.id) setCurrentChatId(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {chat.messages.length > 0 && (
                  <div className="history-ctx-row">
                    <div
                      className="history-ctx-bar-bg"
                      title={`컨텍스트: ~${fmtTokens(usedTokens)} / ${fmtTokens(maxTokens)} 토큰 (${pct.toFixed(1)}%) — ${modelLabel}`}
                    >
                      <div
                        className="history-ctx-bar-fill"
                        style={{ width: `${pct}%`, background: barColor }}
                      />
                    </div>
                    <span className="history-ctx-label" style={{ color: barColor }}>
                      {fmtTokens(usedTokens)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Story Bible (Fixed Context) Section */}
        <div className={`story-bible-section ${isStoryBibleOpen ? 'expanded' : ''}`}>
          <div className="story-bible-header">
            <button 
              className="story-bible-toggle"
              onClick={() => setIsStoryBibleOpen(!isStoryBibleOpen)}
            >
              <Bot size={16} />
              <span>📖 스토리 바이블</span>
            </button>
            {isStoryBibleOpen && storyBible.trim() && (
              <button 
                className="section-clear-btn" 
                onClick={(e) => { e.stopPropagation(); setStoryBible(''); }}
                title="전체 삭제"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="story-bible-content">
            <textarea
              placeholder="세계관, 인물 설정, 줄거리 요약 등 고정된 맥락을 입력하세요..."
              value={storyBible}
              onChange={(e) => setStoryBible(e.target.value)}
            />
          </div>
        </div>

        {/* Master Prompt (Behavior Instructions) Section */}
        <div className={`story-bible-section master-prompt-section ${isMasterPromptOpen ? 'expanded' : ''}`}>
          <div className="story-bible-header">
            <button
              className="story-bible-toggle"
              onClick={() => setIsMasterPromptOpen(!isMasterPromptOpen)}
            >
              <Bot size={16} />
              <span>🖋️ 마스터 프롬프트</span>
            </button>
            {isMasterPromptOpen && masterPrompt.trim() && (
              <button 
                className="section-clear-btn" 
                onClick={(e) => { e.stopPropagation(); setMasterPrompt(''); }}
                title="전체 삭제"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="story-bible-content">
            <textarea
              placeholder="문체, 서술 방식, 금기사항 등 AI의 행동 지침을 입력하세요..."
              value={masterPrompt}
              onChange={(e) => setMasterPrompt(e.target.value)}
            />
          </div>
        </div>

        {/* Usage Monitor */}
        <div className="usage-monitor">
          <div className="usage-label">API 잔여 크레딧</div>

          {/* 실제 잔액 조회 결과 */}
          {realBalance !== null && !balanceError && (
            <div className="usage-real-balance">
              <span className="usage-real-amount">${realBalance.toFixed(2)}</span>
              <span className="usage-real-tag">실제 잔액</span>
            </div>
          )}
          {balanceError && (
            <div className="usage-balance-error">⚠️ {balanceError}</div>
          )}

          {/* 로컬 추적 (추정치) */}
          <div className="usage-estimate-label">로컬 추정 잔액</div>
          <div className="usage-amount">
            ${(BUDGET - totalSpent).toFixed(2)}
          </div>
          <div className="usage-percent">
            {((BUDGET - totalSpent) / BUDGET * 100).toFixed(1)}% 남음
          </div>
          <div className="usage-bar-bg">
            <div
              className="usage-bar-fill"
              style={{ width: `${Math.min(100, ((BUDGET - totalSpent) / BUDGET) * 100)}%` }}
            />
          </div>
          <div className="usage-base">기준: ${BUDGET}</div>

          <div className="usage-btn-row">
            <button
              className="usage-check-btn"
              onClick={fetchBalance}
              disabled={balanceLoading}
            >
              {balanceLoading ? '조회 중...' : '✅ 실제 잔액 확인'}
            </button>
            <button
              className="usage-reset-btn"
              onClick={() => {
                setTotalSpent(0);
                localStorage.removeItem('chois-total-spent');
              }}
            >초기화</button>
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <SearchPanel
          chats={chats}
          onClose={() => setIsSearchOpen(false)}
          onSelect={(chatId, msgIdx) => {
            setCurrentChatId(chatId);
            if (window.innerWidth <= 768) setIsSidebarOpen(false);
            // 스크롤 + 하이라이트: DOM이 렌더된 후 실행
            setTimeout(() => {
              const el = document.getElementById(`msg-${msgIdx}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              setSearchHighlight({ msgIdx });
              // 2.5수 후 하이라이트 해제
              setTimeout(() => setSearchHighlight(null), 2500);
            }, 120);
          }}
        />
      )}

      <div className="main-content">
        <header className="chat-header">
          {/* Hamburger for mobile */}
          <button
            className="hamburger-btn"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            aria-label="Toggle sidebar"
          >
            <span /><span /><span />
          </button>
          <div className="model-selector">
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <button
            className="header-search-btn"
            onClick={() => setIsSearchOpen(true)}
            aria-label="전체 검색"
            title="전체 대화 검색 (Ctrl+K)"
          >
            <Search size={18} />
          </button>
        </header>

        <div className="chat-body">
          <div className="chat-container" ref={chatContainerRef} onScroll={handleScroll}>
            {!currentChat || messages.length === 0 ? (
              <div className="welcome-screen">
                <h1>Chois-Chat</h1>
                <p>소설 작성 및 비용 최적화 기능 포함된 전문 AI 비서입니다.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  index={i}
                  copiedIndex={copiedIndex}
                  onCopy={handleCopy}
                  isHighlighted={searchHighlight?.msgIdx === i}
                />
              ))
            )}
          </div>

          <div className="input-area">
            <div className="input-wrapper">
              {attachments.length > 0 && (
                <div className="previews">
                  {attachments.map((att, i) => (
                    <div key={i} className={`preview-item ${att.kind === 'document' ? 'doc-preview-item' : ''}`}>
                      {att.kind === 'image' ? (
                        <img src={att.preview} alt="preview" />
                      ) : (
                        <div className="doc-preview-inner">
                          <FileText size={22} className="doc-preview-icon" />
                          <span className="doc-preview-name" title={att.name}>
                            {att.name.length > 16 ? att.name.substring(0, 14) + '…' : att.name}
                          </span>
                        </div>
                      )}
                      <button onClick={() => removeAttachment(i)} className="remove-btn"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="input-container">
                <button className="attach-btn" onClick={() => fileInputRef.current.click()}>
                  <Paperclip size={20} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  multiple 
                  accept="image/*,.txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
                <textarea
                  ref={textareaRef}
                  placeholder="메시지 입력..."
                  rows={1}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                />
                {isLoading ? (
                  <button className="stop-btn" onClick={handleStop}>
                    <Square size={18} fill="white" />
                  </button>
                ) : (
                  <button 
                    className="send-btn" 
                    onClick={handleSend}
                    disabled={(!input.trim() && attachments.length === 0) || isLoading}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;

