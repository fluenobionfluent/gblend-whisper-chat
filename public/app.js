// public/app.js
document.addEventListener("DOMContentLoaded", () => {
  // UI refs
  const connectBtn     = document.getElementById("connectBtn");
  const errorModal     = document.getElementById("error-modal");
  const modalTitle     = document.getElementById("error-modal-title");
  const modalMessage   = document.getElementById("error-modal-message");
  const primaryBtn     = document.getElementById("modal-primary-btn");
  const secondaryBtn   = document.getElementById("modal-secondary-btn");
  const connectOverlay = document.getElementById("connect-container");
  const chatContainer  = document.getElementById("chat-container");
  const msgsDiv        = document.getElementById("msgs");
  const postBtn        = document.getElementById("postBtn");
  const msgTxt         = document.getElementById("msgTxt");

  // Profile modal refs
  const profileBtn     = document.getElementById("profileBtn");
  const profileModal   = document.getElementById("profileModal");
  const closeProfile   = document.getElementById("closeProfile");
  const modalPic       = document.getElementById("profilePic");
  const modalAddr      = document.getElementById("modalAddr");
  const modalCount     = document.getElementById("modalCount");

  // Config
  const RPC_URL       = "https://rpc.dev.gblend.xyz/";
  const CONTRACT_ADDR = "0x35F51878B499d0981A0bbAF250e847cFD8E1E94E";
  const ABI = [
    "function post(string calldata) payable",
    "event NewMessage(uint256 indexed id,address indexed author,string text,uint256 ts)"
  ];

  let provider, chatWrite, userAddress;

  // --- Modal helpers ---
  function showModal({ title, message, primaryText, primaryAction = hideModal, secondaryText = null, secondaryAction = hideModal }) {
    modalTitle.textContent   = title;
    modalMessage.textContent = message;
    primaryBtn.textContent   = primaryText;
    primaryBtn.onclick       = () => { primaryAction(); hideModal(); };
    if (secondaryText) {
      secondaryBtn.textContent = secondaryText;
      secondaryBtn.onclick     = () => { secondaryAction(); hideModal(); };
      secondaryBtn.classList.remove("hidden");
    } else {
      secondaryBtn.classList.add("hidden");
    }
    errorModal.classList.remove("hidden");
  }
  function hideModal() {
    errorModal.classList.add("hidden");
  }

  // --- Network switch helper ---
  async function switchToDevnet() {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x5201" }] // 20993
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId:        "0x5201",
            chainName:      "Fluent Devnet",
            rpcUrls:        [RPC_URL],
            nativeCurrency: { name:"FTN", symbol:"FTN", decimals:18 }
          }]
        });
      } else {
        console.error("Switch chain failed:", err);
      }
    }
  }

  // hide error if user switches manually
  if (window.ethereum) {
    window.ethereum.on("chainChanged", hex => {
      if (Number(hex) === 20993) hideModal();
    });
  }

  // --- CONNECT WORKFLOW ---
  connectBtn.addEventListener("click", async () => {
    try {
      // 1) connect wallet
      if (window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
      } else {
        const wc = await window.WalletConnectEthereumProvider.init({
          projectId:   "9a6654dc948ff7c9ef5c774f4456ed22",
          chains:      [20993],
          showQrModal: true,
          rpcMap:      { 20993: RPC_URL }
        });
        await wc.connect();
        provider = new ethers.providers.Web3Provider(wc);
      }

      // 2) network check
      const { chainId } = await provider.getNetwork();
      if (chainId !== 20993) {
        return showModal({
          title:         "Wrong Network",
          message:       "Please switch to Fluent Devnet.",
          primaryText:   "Switch Network",
          primaryAction: switchToDevnet,
          secondaryText: "Cancel"
        });
      }

      // 3) signer & contract
      const signer      = provider.getSigner();
      userAddress       = (await signer.getAddress()).toLowerCase();
      chatWrite         = new ethers.Contract(CONTRACT_ADDR, ABI, signer);

      // 4) show chat UI
      hideModal();
      connectOverlay.classList.add("hidden");
      chatContainer.classList.remove("hidden");

      // 5) load messages + subscribe
      await loadMessages();
      chatWrite.on("NewMessage", handleNewMessage);

    } catch (err) {
      console.error("Connection failed:", err);
      showModal({ title:"Connection Error", message:"Could not connect—try again.", primaryText:"OK" });
    }
  });

  // --- POST WHISPER ---
  postBtn.addEventListener("click", async () => {
    const text = msgTxt.value.trim();
    if (!text) return;

    postBtn.disabled = true;
    try {
      const tx = await chatWrite.post(text, {
        value:    ethers.utils.parseEther("0.001"),
        gasLimit: 200_000
      });
      await tx.wait();
      msgTxt.value = "";
      // the event listener will render it
    } catch (e) {
      console.error("Post failed:", e);
      const reason = e.error?.message || e.reason || e.data?.message || "Transaction reverted";
      showModal({ title:"Whisper Failed", message:reason, primaryText:"OK" });
    }
    postBtn.disabled = false;
  });

  // --- EVENT HANDLER ---
  async function handleNewMessage(id, author, text, ts) {
    const m = {
      id:        id.toNumber(),
      author:    author.toLowerCase(),
      text,
      timestamp: ts.toNumber() * 1000
    };
    appendMessage(m);
    msgsDiv.scrollTop = msgsDiv.scrollHeight;

    // ingest into DB
    try {
      await fetch("/api/messages", {
        method:  "POST",
        headers: { "Content-Type":"application/json" },
        body:    JSON.stringify(m)
      });
    } catch (e) {
      console.error("DB ingest failed:", e);
    }
  }

  // --- LOAD HISTORY ---
  async function loadMessages() {
    msgsDiv.innerHTML = "";
    let messages = [];
    try {
      messages = await fetch("/api/messages").then(r=>r.json());
    } catch (e) {
      console.error("Could not fetch messages:", e);
      return;
    }
    messages.forEach(appendMessage);
    gsap.from("#msgs > div", { opacity:0, y:20, stagger:0.03, duration:0.3 });
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
  }

  // --- RENDER MESSAGE ---
  function appendMessage(m) {
    const time = new Date(m.timestamp).toLocaleTimeString();
    const card = document.createElement("div");
    card.className = "p-4 bg-gray-800 bg-opacity-60 rounded-xl flex items-start space-x-3";
    card.innerHTML = `
      <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-sm font-bold">
        ${m.author.slice(2,4)}
      </div>
      <div class="flex-1">
        <div class="text-xs text-gray-400 mb-1">${time} • ${m.author.slice(0,6)}…</div>
        <div class="text-gray-100 break-words">${m.text}</div>
      </div>`;
    msgsDiv.appendChild(card);
  }

  // --- PROFILE BUTTON ---
  profileBtn.addEventListener("click", async () => {
    try {
      const data = await fetch(`/api/profile/${userAddress}`).then(r=>r.json());
      modalAddr.textContent  = userAddress;
      modalCount.textContent = `Messages sent: ${data.count}`;

      // always same avatar:
      modalPic.src = "/assets/default-avatar.jpg";

      profileModal.classList.remove("hidden");
    } catch (e) {
      console.error("Profile fetch failed:", e);
    }
  });

  closeProfile.addEventListener("click", () => {
    profileModal.classList.add("hidden");
  });
});
