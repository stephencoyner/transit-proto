'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { InsightCard as InsightCardType, InsightsResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';
import { SegmentedControl } from '@/components/ui';
import type { ChatMessage, ChatConversation } from '@/lib/chatHistory';
import { getChatHistory, generateConversationId } from '@/lib/chatHistory';

interface InsightsPanelProps {
  data: InsightsResponse | null;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onInvestigate: (insight: InsightCardType) => void;
  onGenerate: () => void;
  onRefresh: () => void;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chatTitle: string;
  setChatTitle: React.Dispatch<React.SetStateAction<string>>;
  chatConvoId: string;
  setChatConvoId: React.Dispatch<React.SetStateAction<string>>;
}

const GREETINGS = [
  'What would you like to explore?',
  'Ready when you are.',
  'Good to have you back!',
  "Let's take a look at things.",
  'What can I help you find?',
  "Let's dig into the data.",
  'What are you curious about?',
  'Ready to explore the numbers.',
  "How's the network looking?",
  'What should we look at today?',
  "Let's see what's happening.",
  'Need help with anything?',
  'Where should we start?',
  "Let's find some patterns.",
  'What routes are on your mind?',
  'Ready to dive in.',
  "What's on your radar today?",
  'Happy to help you explore.',
];

// Pick a stable greeting per session (based on date so it doesn't change on re-render)
const sessionGreeting = GREETINGS[Math.floor(Date.now() / 86400000) % GREETINGS.length];

export function InsightsPanel({
  data,
  isLoading,
  error,
  onClose,
  onInvestigate,
  onGenerate,
  onRefresh,
  chatMessages: messages,
  setChatMessages: setMessages,
  chatTitle,
  setChatTitle,
  chatConvoId,
  setChatConvoId,
}: InsightsPanelProps) {
  const hasData = data && data.insights.length > 0;
  const showInitialState = !data && !isLoading && !error;

  // Chat state (local only)
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [homeTab, setHomeTab] = useState<'home' | 'history'>('home');
  const [isControlStuck, setIsControlStuck] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [chatHistory, setChatHistory] = useState<ChatConversation[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const inChat = messages.length > 0 || isChatLoading;

  // Load chat history when switching to history tab
  useEffect(() => {
    if (homeTab === 'history') {
      setChatHistory(getChatHistory());
    }
  }, [homeTab]);

  // Auto-resize textarea (home mode input only)
  useEffect(() => {
    if (!inChat && inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [chatInput, inChat]);

  // Auto-scroll to bottom in chat mode
  useEffect(() => {
    if (inChat) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading, inChat]);

  // Show divider when content scrolls under the segmented control
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setIsControlStuck(container.scrollTop > 64);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [inChat]);

  const sendMessage = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;

    // Generate convo ID and title from first message
    if (messages.length === 0) {
      setChatConvoId(generateConversationId());
      setChatTitle('New Chat');
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Generate a 2-4 word title for this chat message. Reply with ONLY the title, nothing else: "${trimmed}"` }],
          system: 'You generate ultra-short chat titles. Reply with only 2-4 words, no punctuation, no quotes.',
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.content) setChatTitle(d.content.trim()); })
        .catch(() => {});
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat request failed');
      }

      const responseData = await res.json();
      setMessages([...updatedMessages, { role: 'assistant', content: responseData.content }]);
    } catch (err) {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleBackFromChat = () => {
    setMessages([]);
    setChatTitle('');
    setChatInput('');
    setChatConvoId('');
  };

  const openConversation = (convo: ChatConversation) => {
    setChatConvoId(convo.id);
    setChatTitle(convo.title);
    setMessages(convo.messages);
    setHomeTab('home');
  };

  // ── Chat Mode ──
  if (inChat) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)',
          position: 'relative',
        }}
      >
        {/* Chat Header */}
        <div
          style={{
            padding: '16px 28px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              maxWidth: '700px',
              margin: '0 auto',
              width: '100%',
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <button
              onClick={handleBackFromChat}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 4px 4px 0',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
              </svg>
            </button>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chatTitle}
            </span>
          </div>
        </div>

        {/* Chat Messages */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px 28px 104px',
          }}
        >
          <div
            style={{
              maxWidth: '700px',
              margin: '0 auto',
              width: '100%',
              padding: '0 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className={msg.role === 'assistant' ? 'chat-markdown' : undefined}
                  style={{
                    maxWidth: msg.role === 'user' ? '75%' : '100%',
                    padding: msg.role === 'user' ? '10px 14px' : '4px 0',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '0',
                    backgroundColor: msg.role === 'user' ? 'var(--text-secondary)' : 'transparent',
                    color: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--text-primary)',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isChatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    backgroundColor: 'var(--bg-secondary)',
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'chatDot 1.4s ease-in-out infinite', animationDelay: '0s' }} />
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'chatDot 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--text-tertiary)', animation: 'chatDot 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Chat Input — floating at bottom with solid bg below input only */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            pointerEvents: 'none',
          }}
        >
          {/* Solid background — covers from midway through the input to the bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '80px',
              backgroundColor: 'var(--bg-primary)',
            }}
          />
          {/* Input */}
          <div
            style={{
              position: 'relative',
              maxWidth: 'calc(700px + 56px)',
              width: '100%',
              margin: '0 auto',
              padding: '0 28px 0',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: '36px',
                padding: '20px',
                border: '0.5px solid var(--border-default)',
                height: '72px',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
              }}
            >
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply..."
                rows={1}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  lineHeight: '1.5',
                  resize: 'none',
                  fontFamily: 'Inter, sans-serif',
                  marginLeft: '8px',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: chatInput.trim() && !isChatLoading ? 'pointer' : 'default',
                  padding: '4px',
                  color: chatInput.trim() && !isChatLoading ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  opacity: chatInput.trim() && !isChatLoading ? 1 : 0.4,
                  flexShrink: 0,
                  transition: 'opacity 0.15s ease',
                }}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p style={{
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--text-disabled)',
              margin: '16px 0 16px',
            }}>
              Hopthru is AI and can make mistakes
            </p>
          </div>
        </div>

        <style>{`
          @keyframes chatDot {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1); }
          }
          .chat-markdown p { margin: 0 0 12px; }
          .chat-markdown p:last-child { margin-bottom: 0; }
          .chat-markdown ul, .chat-markdown ol { margin: 0 0 12px; padding-left: 20px; }
          .chat-markdown li { margin-bottom: 4px; }
          .chat-markdown h1, .chat-markdown h2, .chat-markdown h3 {
            margin: 16px 0 8px;
            font-weight: 600;
          }
          .chat-markdown h1 { font-size: 20px; }
          .chat-markdown h2 { font-size: 18px; }
          .chat-markdown h3 { font-size: 16px; }
          .chat-markdown code {
            background: var(--bg-secondary);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 14px;
          }
          .chat-markdown pre {
            background: var(--bg-secondary);
            padding: 12px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 0 0 12px;
          }
          .chat-markdown pre code {
            background: none;
            padding: 0;
          }
          .chat-markdown strong { font-weight: 600; }
          .chat-markdown table {
            border-collapse: collapse;
            margin: 0 0 12px;
            width: 100%;
            font-size: 14px;
          }
          .chat-markdown th, .chat-markdown td {
            border: 1px solid var(--border-default);
            padding: 6px 10px;
            text-align: left;
          }
          .chat-markdown th {
            font-weight: 600;
            background: var(--bg-secondary);
          }
        `}</style>
      </div>
    );
  }

  // ── Home Mode (insights + chat input at top) ──
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Segmented Control - fixed above scroll */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '16px',
        paddingBottom: '16px',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: isControlStuck ? 'var(--border-width) solid var(--border-default)' : 'var(--border-width) solid transparent',
        transition: 'border-color 150ms ease',
      }}>
        <SegmentedControl
          options={[{ value: 'home', label: 'Home' }, { value: 'history', label: 'History' }]}
          value={homeTab}
          onChange={(v) => setHomeTab(v as 'home' | 'history')}
        />
      </div>
      {/* Scrollable Content */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 24px 40px',
        }}
      >
        <div style={{ height: '64px' }} />
        {homeTab === 'history' ? (
          <div
            style={{
              maxWidth: '700px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            {chatHistory.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '80px 40px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '12px' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 4px' }}>No chat history yet</p>
                <p style={{ fontSize: '13px', margin: 0 }}>Your conversations will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(() => {
                  const now = new Date();
                  const yesterday = new Date(now);
                  yesterday.setDate(yesterday.getDate() - 1);

                  // Group conversations by date label
                  let lastLabel = '';
                  return chatHistory.map((convo, idx) => {
                    const date = new Date(convo.updatedAt);
                    const isToday = date.toDateString() === now.toDateString();
                    const isYesterday = date.toDateString() === yesterday.toDateString();
                    const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
                    const showLabel = label !== lastLabel;
                    lastLabel = label;

                    const lastMsg = convo.messages[convo.messages.length - 1];
                    const stripped = lastMsg ? lastMsg.content.replace(/[#*_`~\[\]()>|\\-]/g, '').replace(/\n+/g, ' ').trim() : '';
                    const preview = stripped.slice(0, 140) + (stripped.length > 140 ? '...' : '');

                    return (
                      <React.Fragment key={convo.id}>
                        {/* {showLabel && (
                          <div style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            padding: '20px 20px 8px',
                          }}>
                            {label}
                          </div>
                        )} */}
                        <button
                          onClick={() => openConversation(convo)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            padding: '12px 20px',
                            background: 'none',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {convo.title}
                          </span>
                          <span style={{ fontSize: '16px', color: 'var(--text-tertiary)', lineHeight: 1.4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {preview}
                          </span>
                        </button>
                        {idx < chatHistory.length - 1 && (
                          <div style={{ height: '0.5px', backgroundColor: 'var(--border-default)', margin: '4px 20px' }} />
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        ) : (<>
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          <p
            style={{
              fontSize: '14px',
              fontWeight: 400,
              color: 'var(--text-tertiary)',
              margin: '0 0 4px',
            }}
          >
            Hi Stephen 👋
          </p>
          {/* Title */}
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
              lineHeight: 1.2,
            }}
          >
            {sessionGreeting}
          </h1>

          {/* Chat Input */}
          <div style={{ margin: '16px 0 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: '36px',
                padding: '20px',
                border: '0.5px solid var(--border-default)',
                height: '64px',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
              }}
            >
              <textarea
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Hopthru..."
                rows={1}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  lineHeight: '1.5',
                  resize: 'none',
                  fontFamily: 'Inter, sans-serif',
                  marginLeft: '8px',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: chatInput.trim() && !isChatLoading ? 'pointer' : 'default',
                  padding: '4px',
                  color: chatInput.trim() && !isChatLoading ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  opacity: chatInput.trim() && !isChatLoading ? 1 : 0.4,
                  flexShrink: 0,
                  transition: 'opacity 0.15s ease',
                }}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Initial State — Generate Button */}
          {showInitialState && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 40px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'var(--bg-elevated)',
                  border: 'var(--border-width) solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="var(--text-tertiary)" opacity="0.6"/>
                </svg>
              </div>
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  margin: '0 0 8px',
                }}
              >
                Analyze your transit data with AI
              </p>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 24px',
                  maxWidth: '360px',
                  lineHeight: 1.5,
                }}
              >
                Claude will explore ridership patterns across all 10 routes, identify capacity issues, and surface actionable findings.
              </p>
              <button
                onClick={onGenerate}
                style={{
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                Generate Insights
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && !data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '20px' }}>
              <LoadingCard label="Analyzing system metrics..." />
              <LoadingCard label="Examining route patterns..." delay={300} />
              <LoadingCard label="Generating insights..." delay={600} />
            </div>
          )}

          {/* Error State */}
          {error && !data && !isLoading && (
            <div
              style={{
                background: 'rgba(196, 67, 40, 0.06)',
                border: '1px solid rgba(196, 67, 40, 0.2)',
                borderRadius: '16px',
                padding: '24px',
                marginTop: '20px',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--error)', margin: '0 0 8px' }}>
                Unable to generate insights
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                {error.message}
              </p>
              <button
                onClick={onGenerate}
                style={{
                  background: 'none',
                  border: 'var(--border-width) solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            </div>
          )}

        </div>

          {/* Insight Cards */}
          {hasData && (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '24px',
                marginTop: '140px',
              }}>
                {data.insights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onInvestigate={onInvestigate}
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {data && data.insights.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-tertiary)',
              }}
            >
              <p style={{ fontSize: '15px', margin: '0 0 8px' }}>No notable findings at this time.</p>
              <p style={{ fontSize: '13px', margin: 0 }}>Try refreshing to run a new analysis.</p>
            </div>
          )}
        </>)}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Loading skeleton card
function LoadingCard({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: 'var(--border-width) solid var(--border-default)',
        borderRadius: '20px',
        padding: '24px',
        animation: `fadeInUp 400ms ease ${delay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--text-tertiary)',
            animation: 'pulse 1.5s ease infinite',
          }}
        />
        <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      {/* Skeleton lines */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '85%' }} />
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '65%' }} />
        <div style={{ height: '12px', background: 'var(--bg-primary)', borderRadius: '6px', width: '75%' }} />
      </div>
    </div>
  );
}
