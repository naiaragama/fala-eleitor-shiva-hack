const chatBox = document.getElementById("chat-box");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
let chatOpen = false;

function toggleChat() {
  chatOpen = !chatOpen;
  chatBox.classList.toggle("open", chatOpen);
  if (chatOpen && chatMessages.children.length === 0) {
    addMsg("bot", "👋 Olá! Sou o *Fala Eleitor*.\n\nPergunte sobre deputados do RJ:\n• Gastos da Talíria\n• Projetos do Luizinho\n• Resumo geral\n\nDigite *ajuda* para ver todos os comandos.");
  }
  if (chatOpen) chatInput.focus();
}

function addMsg(type, text) {
  const div = document.createElement("div");
  div.className = `msg msg-${type}`;
  // Converte *negrito* para <strong> no HTML
  div.innerHTML = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  addMsg("user", msg);
  chatInput.value = "";
  chatInput.disabled = true;

  // Indicador de digitação
  const typing = document.createElement("div");
  typing.className = "msg msg-bot";
  typing.textContent = "⏳ Consultando dados...";
  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch("/api/webhook/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: msg }),
    });
    const data = await res.json();
    typing.remove();
    addMsg("bot", data.resposta || "Erro ao processar.");
  } catch {
    typing.remove();
    addMsg("bot", "⚠️ Erro de conexão. Tente novamente.");
  }

  chatInput.disabled = false;
  chatInput.focus();
}
