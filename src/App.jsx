import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plus, User, Bot, Paperclip, X, Square, Trash2, MessageSquare } from 'lucide-react';
import './index.css';

const MODELS = [
  { id: 'auto', name: 'Auto (최적화)', desc: '비용 대비 성능 자동 조절' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', desc: '빠르고 저렴한 처리' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Pro', desc: '복잡한 논리 및 시각 분석' }
];

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

  // Model pricing per 1M tokens
  const MODEL_PRICING = {
    'gpt-5.4-mini': { input: 0.15, output: 0.60 },
    'gpt-5.4':      { input: 2.50, output: 10.00 },
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

  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const messages = currentChat ? currentChat.messages : [];

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments(prev => [...prev, { file, preview: reader.result }]);
      };
      reader.readAsDataURL(file);
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
      content.push({ type: 'image_url', image_url: { url: att.preview } });
    });

    const userMessage = { role: 'user', content };
    const updatedUserMessages = [...messages, userMessage];
    
    // Update local state and title if first message
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        return { 
          ...c, 
          messages: updatedUserMessages,
          title: c.messages.length === 0 ? (input.trim().substring(0, 20) || '이미지 대화') : c.title
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
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`history-item ${currentChatId === chat.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentChatId(chat.id);
                // 모바일이면 방 선택 후 메뉴 닫기
                if (window.innerWidth <= 768) setIsSidebarOpen(false);
              }}
            >
              <MessageSquare size={16} />
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
          ))}
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
          <button
            className="usage-reset-btn"
            onClick={() => {
              setTotalSpent(0);
              localStorage.removeItem('chois-total-spent');
            }}
          >추적 초기화</button>
        </div>
      </div>

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
                <div key={i} className={`message-row ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                  <div className="message-content">
                    <div className={`avatar ${msg.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}`}>
                      {msg.role === 'assistant' ? <Bot size={20} color="white" /> : <User size={20} color="white" />}
                    </div>
                    <div className="text">
                      {Array.isArray(msg.content) ? (
                        msg.content.map((c, j) => (
                          <div key={j}>
                            {c.type === 'text' && <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.text}</ReactMarkdown>}
                            {c.type === 'image_url' && <img src={c.image_url.url} alt="Uploaded" className="chat-img" />}
                          </div>
                        ))
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="input-area">
            <div className="input-wrapper">
              {attachments.length > 0 && (
                <div className="previews">
                  {attachments.map((att, i) => (
                    <div key={i} className="preview-item">
                      <img src={att.preview} alt="preview" />
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
                  accept="image/*"
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

