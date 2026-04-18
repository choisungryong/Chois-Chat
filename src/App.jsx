import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
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

  // Auto-save model selection
  useEffect(() => {
    localStorage.setItem('chois-selected-model', selectedModel);
  }, [selectedModel]);

  // Auto-save chats to localStorage
  useEffect(() => {
    localStorage.setItem('chois-chats', JSON.stringify(chats));
  }, [chats]);

  // Scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentChatId, chats]);

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

    setInput('');
    setAttachments([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: updatedUserMessages,
          model: selectedModel
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';
      let streamBuffer = ''; // Buffer for partial SSE lines

      // Initialize AI message
      setChats(prev => prev.map(c => 
        c.id === chatId ? { ...c, messages: [...c.messages, { role: 'assistant', content: '' }] } : c
      ));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || ''; // Keep the last (potentially partial) line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const dataStr = trimmed.substring(6);
          if (dataStr === '[DONE]') break;
          
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices[0].delta?.content || '';
            if (delta) {
              aiContent += delta;
              setChats(prev => prev.map(c => {
                if (c.id === chatId) {
                  const newMsgs = [...c.messages];
                  newMsgs[newMsgs.length - 1].content = aiContent;
                  return { ...c, messages: newMsgs };
                }
                return c;
              }));
            }
          } catch (e) {
            console.warn('JSON parse error, partial data ignored', e);
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setChats(prev => prev.map(c => {
          if (c.id === chatId) {
            return { ...c, messages: [...c.messages, { role: 'assistant', content: '오류: ' + error.message }] };
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
      <div className="sidebar">
        <button className="new-chat-btn" onClick={startNewChat}>
          <Plus size={16} />
          새 채팅
        </button>
        <div className="chat-history">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`history-item ${chat.id === currentChatId ? 'active' : ''}`}
              onClick={() => setCurrentChatId(chat.id)}
            >
              <MessageSquare size={16} />
              <span className="history-title">{chat.title}</span>
              <button className="delete-chat-btn" onClick={(e) => deleteChat(e, chat.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="main-content">
        <header className="chat-header">
          <div className="model-selector">
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="chat-container" ref={chatContainerRef}>
          {!currentChat || messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Chois-Chat</h1>
              <p>비용 최적화 지능형 챗봇 서비스</p>
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
                          {c.type === 'text' && <ReactMarkdown>{c.text}</ReactMarkdown>}
                          {c.type === 'image_url' && <img src={c.image_url.url} alt="Uploaded" className="chat-img" />}
                        </div>
                      ))
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
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
    </>
  );
}

export default App;

