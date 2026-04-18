import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Plus, User, Bot, Paperclip, X, Square } from 'lucide-react';
import './index.css';

const MODELS = [
  { id: 'auto', name: 'Auto (최적화)', desc: '비용 대비 성능 자동 조절' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', desc: '빠르고 저렴한 처리' },
  { id: 'gpt-5.4', name: 'GPT-5.4 Pro', desc: '복잡한 논리 및 시각 분석' }
];

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    abortControllerRef.current = new AbortController();
    
    // Construct user message content
    let content = [];
    if (input.trim()) content.push({ type: 'text', text: input });
    attachments.forEach(att => {
      content.push({ type: 'image_url', image_url: { url: att.preview } });
    });

    const userMessage = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          model: selectedModel
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices[0].delta?.content || '';
              aiContent += delta;
              
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content = aiContent;
                return updated;
              });
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다: ' + error.message }]);
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
        <button className="new-chat-btn" onClick={() => setMessages([])}>
          <Plus size={16} />
          새 채팅
        </button>
      </div>

      <div className="main-content">
        <header className="chat-header">
          <div className="model-selector">
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className="model-desc">{MODELS.find(m => m.id === selectedModel)?.desc}</span>
          </div>
        </header>

        <div className="chat-container" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Chois-Chat</h1>
              <p>비용 최적화 지능형 챗봇 서비스</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`message-row ${msg.role === 'assistant' ? 'ai' : ''}`}>
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

