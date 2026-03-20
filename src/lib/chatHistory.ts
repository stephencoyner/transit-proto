export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'hopthru-chat-history';

export function getChatHistory(): ChatConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveChatConversation(convo: ChatConversation): void {
  const history = getChatHistory();
  const idx = history.findIndex((c) => c.id === convo.id);
  if (idx >= 0) {
    history[idx] = convo;
  } else {
    history.unshift(convo);
  }
  // Keep max 50 conversations
  if (history.length > 50) history.length = 50;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function deleteChatConversation(id: string): void {
  const history = getChatHistory().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function generateConversationId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
