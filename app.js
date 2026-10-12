import {
  fetchTransactions,
  insertTransaction,
  fetchNotes,
  insertNote,
  removeNote,
  loginComEmail,
  logout,
  supabase,
  replicarTransacoesParaProximoMes,
  materializeRecurrences,
  fetchBudgets,
  upsertBudget,
  removeBudget,
  fetchGoals,
  insertGoal,
  updateGoal,
  removeGoal,
} from "./db.js";

import {
  showLoginScreen,
  showDashboardScreen,
  updateDashboardUI,
  showToast,
  showConfirmToast,
  playSuccessSound,
  playUiSelectionSound,
  playUiUnselectionSound,
  playDeleteSound,
  isSoundEnabled,
  setSoundEnabled,
  initTheme,
  toggleTheme,
  openModal,
  closeModal,
  filterAndRenderTransactions,
  updateCategoryDropdown,
  setSort,
  changeSelectedMonth,
  updateMonthDisplay,
  debounce,
  refreshMonthlyBudgetDashboard,
  getCurrentSelection,
  bindDeleteDelegation,
  renderBudgets,
  renderGoals,
  renderInsights,
  renderProjection,
  updateInsights,
} from "./ui.js";

import {
  renderFiiAllocationChart,
  updateFiiAllocationChartTheme,
} from "./chart-manager.js";

import {
  requestNotificationPermission,
  getNotificationPermission,
  checkDueDates,
} from "./notifications.js";
import { exportTransactionsCSV } from "./export.js";

// Estado do usuário atual
let currentAppUser = null;
let currentBudgets = [];
let currentGoals = [];
let currentNotesCache = [];

const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AVATAR_MAX_SAVED_BYTES = 100 * 1024;
const avatarEditorState = { image: null, sourceUrl: null };

function getAvatarStorageKey(user = currentAppUser) {
  return user?.id ? `vaulta-avatar-${user.id}` : "vaulta-avatar-guest";
}

function applySavedAvatar(user = currentAppUser) {
  const avatar = localStorage.getItem(getAvatarStorageKey(user));
  if (avatar) document.getElementById("user-avatar").src = avatar;
}

function setAvatarEditorStatus(message, isError = false) {
  const status = document.getElementById("avatar-editor-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function updateAvatarPreview() {
  const preview = document.getElementById("avatar-crop-preview");
  const zoom = Number(document.getElementById("avatar-zoom")?.value || 1);
  const x = Number(document.getElementById("avatar-x")?.value || 50);
  const y = Number(document.getElementById("avatar-y")?.value || 50);
  const image = avatarEditorState.image;

  if (!preview || !image || !avatarEditorState.sourceUrl) return;

  const coverScale = Math.max(
    256 / image.naturalWidth,
    256 / image.naturalHeight,
  );
  const width = image.naturalWidth * coverScale * zoom;
  const height = image.naturalHeight * coverScale * zoom;
  preview.style.backgroundImage = `url("${avatarEditorState.sourceUrl}")`;
  preview.style.backgroundSize = `${(width / 256) * 100}% ${(height / 256) * 100}%`;
  preview.style.backgroundPosition = `${x}% ${y}%`;
}

function loadAvatarImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Não foi possível abrir esta imagem."));
    image.src = sourceUrl;
  });
}

async function setAvatarEditorImage(sourceUrl) {
  try {
    const image = await loadAvatarImage(sourceUrl);
    if (avatarEditorState.sourceUrl?.startsWith("blob:"))
      URL.revokeObjectURL(avatarEditorState.sourceUrl);
    avatarEditorState.image = image;
    avatarEditorState.sourceUrl = sourceUrl;
    document.getElementById("avatar-zoom").value = "1";
    document.getElementById("avatar-x").value = "50";
    document.getElementById("avatar-y").value = "50";
    updateAvatarPreview();
    setAvatarEditorStatus(
      "Imagem pronta. Ajuste o enquadramento antes de salvar.",
    );
  } catch (error) {
    setAvatarEditorStatus(error.message, true);
  }
}

function cropAvatarToDataUrl() {
  const image = avatarEditorState.image;
  if (!image) throw new Error("Escolha uma imagem antes de salvar.");

  const zoom = Number(document.getElementById("avatar-zoom").value);
  const x = Number(document.getElementById("avatar-x").value) / 100;
  const y = Number(document.getElementById("avatar-y").value) / 100;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const coverScale =
    Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
  const width = image.naturalWidth * coverScale;
  const height = image.naturalHeight * coverScale;
  context.drawImage(
    image,
    (size - width) * x,
    (size - height) * y,
    width,
    height,
  );

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > AVATAR_MAX_SAVED_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > AVATAR_MAX_SAVED_BYTES) {
    throw new Error("A imagem continua grande demais. Escolha outra imagem.");
  }
  return dataUrl;
}

function resetAvatarEditor() {
  if (avatarEditorState.sourceUrl?.startsWith("blob:"))
    URL.revokeObjectURL(avatarEditorState.sourceUrl);
  avatarEditorState.image = null;
  avatarEditorState.sourceUrl = null;
  const preview = document.getElementById("avatar-crop-preview");
  if (preview) preview.style.backgroundImage = "";
  document.getElementById("avatar-url-input").value = "";
  document.getElementById("avatar-file-input").value = "";
  document.getElementById("avatar-zoom").value = "1";
  document.getElementById("avatar-x").value = "50";
  document.getElementById("avatar-y").value = "50";
  setAvatarEditorStatus(
    "Carregue uma imagem para começar. Arquivos de até 8 MB.",
  );
}

function openAvatarEditor() {
  resetAvatarEditor();
  document.getElementById("avatar-crop-modal")?.classList.add("active");
}

function closeAvatarEditor() {
  document.getElementById("avatar-crop-modal")?.classList.remove("active");
  resetAvatarEditor();
}

// Remove versões antigas do Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    if (registrations.length) {
      console.info("Service Worker antigo removido.");
    }
  });
}

window.addEventListener('month-changed', async (e) => {
    const { month, year } = e.detail;
    try {
        await materializeRecurrences(year, month, null); // só o mês alvo
        window.allTransactions = await fetchTransactions();
        updateDashboardUI(window.allTransactions);
        refreshMonthlyBudgetDashboard();

        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        currentBudgets = await fetchBudgets(monthKey);
        renderBudgets(currentBudgets, window.allTransactions, { month, year });
    } catch (err) {
        console.error('Erro ao materializar recorrências:', err);
    }
});

// =====================================================================
// INICIALIZAÇÃO
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const btnVisitante = document.getElementById("btn-login-visitante");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("user-email")?.value.trim();
    const password = document.getElementById("user-pass")?.value;

    if (!email || !password) {
      showToast("Por favor, preencha e-mail e senha.", "error");
      return;
    }

    try {
      await loginComEmail(email, password);
    } catch (err) {
      console.error(err);
      const message = String(err?.message || "").toLowerCase();
      const isNetworkError =
        message.includes("failed to fetch") || message.includes("network");
      showToast(
        isNetworkError
          ? "Não foi possível conectar ao Supabase. Verifique sua internet ou bloqueadores de conteúdo."
          : "E-mail ou senha incorretos.",
        "error",
      );
    }
  });

  document
    .getElementById("trans-recurrence")
    ?.addEventListener("change", (e) => {
      const group = document.getElementById("recurrence-end-group");
      if (group) group.style.display = e.target.value ? "grid" : "none";
    });

  document.getElementById("export-btn")?.addEventListener("click", () => {
    const list = window.allTransactions || [];
    if (!list.length) {
      showToast("Nada para exportar.", "error");
      return;
    }
    const ok = exportTransactionsCSV(list);
    if (ok) {
      playSuccessSound();
      showToast("CSV exportado.", "success");
    }
  });

  const notifyBtn = document.getElementById("notify-toggle");
  async function refreshNotifyButton() {
    if (!notifyBtn) return;
    const perm = getNotificationPermission();
    notifyBtn.classList.toggle("active", perm === "granted");
    notifyBtn.title =
      perm === "granted"
        ? "Notificações ativadas"
        : "Ativar notificações de vencimento";
  }
  refreshNotifyButton();

  notifyBtn?.addEventListener("click", async () => {
    if (getNotificationPermission() === "granted") {
      showToast("Notificações já estão ativas.", "success");
      return;
    }
    const result = await requestNotificationPermission();
    await refreshNotifyButton();
    if (result === "granted") {
      showToast("Você será avisado sobre contas a vencer.", "success");
      playSuccessSound();
      checkDueDates(window.allTransactions || []);
    } else {
      showToast("Permissão negada pelo navegador.", "error");
    }
  });

  const budgetModal = document.getElementById("budget-modal");
  document
    .getElementById("open-budget-modal-btn")
    ?.addEventListener("click", () => {
      updateCategoryDropdown("expense"); // popula o select de orçamento
      budgetModal?.classList.add("active");
      playUiSelectionSound();
    });
  document
    .getElementById("cancel-budget-btn")
    ?.addEventListener("click", () => {
      budgetModal?.classList.remove("active");
      playUiUnselectionSound();
    });
  budgetModal?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) budgetModal.classList.remove("active");
  });

  document
    .getElementById("budget-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = document.getElementById("budget-category").value;
      const amount = parseFloat(document.getElementById("budget-amount").value);
      if (!category || !Number.isFinite(amount) || amount < 0) {
        showToast("Preencha os campos do orçamento.", "error");
        return;
      }
      const { month, year } = getCurrentSelection();
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      try {
        await upsertBudget(category, amount, monthKey);
        budgetModal?.classList.remove("active");
        document.getElementById("budget-form").reset();
        showToast("Orçamento salvo.", "success");
        playSuccessSound();
        currentBudgets = await fetchBudgets(monthKey);
        renderBudgets(currentBudgets, window.allTransactions || [], {
          month,
          year,
        });
      } catch (err) {
        console.error(err);
        showToast("Erro ao salvar orçamento.", "error");
      }
    });

  document
    .getElementById("budgets-grid")
    ?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".budget-remove");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      try {
        await removeBudget(id);
        currentBudgets = currentBudgets.filter(
          (b) => String(b.id) !== String(id),
        );
        const { month, year } = getCurrentSelection();
        renderBudgets(currentBudgets, window.allTransactions || [], {
          month,
          year,
        });
        playDeleteSound();
        showToast("Orçamento removido.", "success");
      } catch (err) {
        console.error(err);
        showToast("Erro ao remover orçamento.", "error");
      }
    });

  const goalModal = document.getElementById("goal-modal");
  document
    .getElementById("open-goal-modal-btn")
    ?.addEventListener("click", () => {
      goalModal?.classList.add("active");
      playUiSelectionSound();
    });
  document.getElementById("cancel-goal-btn")?.addEventListener("click", () => {
    goalModal?.classList.remove("active");
    playUiUnselectionSound();
  });
  goalModal?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) goalModal.classList.remove("active");
  });

  document
    .getElementById("goal-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("goal-name").value.trim();
      const target = parseFloat(document.getElementById("goal-target").value);
      const current =
        parseFloat(document.getElementById("goal-current").value) || 0;
      const deadline = document.getElementById("goal-deadline").value || null;

      if (!name || !Number.isFinite(target) || target <= 0) {
        showToast("Preencha nome e valor alvo.", "error");
        return;
      }

      try {
        await insertGoal({
          name,
          target_amount: target,
          current_amount: current,
          deadline,
        });
        goalModal?.classList.remove("active");
        document.getElementById("goal-form").reset();
        showToast("Meta criada.", "success");
        playSuccessSound();
        currentGoals = await fetchGoals();
        renderGoals(currentGoals);
      } catch (err) {
        console.error(err);
        showToast("Erro ao criar meta.", "error");
      }
    });

  document
    .getElementById("goals-grid")
    ?.addEventListener("click", async (e) => {
      const addBtn = e.target.closest(".goal-add-btn");
      const removeBtn = e.target.closest(".goal-remove-btn");

      if (addBtn) {
        const id = addBtn.dataset.id;
        const goal = currentGoals.find((g) => String(g.id) === String(id));
        if (!goal) return;
        const value = prompt(`Quanto adicionar em "${goal.name}"?`, "0");
        const amount = parseFloat(String(value || "").replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0) return;
        const next = Number(goal.current_amount || 0) + amount;
        try {
          await updateGoal(id, { current_amount: next });
          playSuccessSound();
          currentGoals = await fetchGoals();
          renderGoals(currentGoals);
        } catch (err) {
          console.error(err);
          showToast("Erro ao atualizar meta.", "error");
        }
        return;
      }

      if (removeBtn) {
        const id = removeBtn.dataset.id;
        const ok = await showConfirmToast("Excluir esta meta?", {
          confirmLabel: "Excluir",
        });
        if (!ok) return;
        try {
          await removeGoal(id);
          playDeleteSound();
          currentGoals = await fetchGoals();
          renderGoals(currentGoals);
          showToast("Meta removida.", "success");
        } catch (err) {
          console.error(err);
          showToast("Erro ao remover meta.", "error");
        }
      }
    });

  btnVisitante?.addEventListener("click", () => {
    currentAppUser = {
      email: "demo@demo.com",
      user_metadata: { full_name: "Visitante" },
    };
    showDashboardScreen(currentAppUser, true);
    applySavedAvatar(currentAppUser);
    updateDashboardUI([]);
    loadFiiData();
  });

  // ---- Som ----
  const soundToggleBtn = document.getElementById("sound-toggle");
  soundToggleBtn?.addEventListener("click", () => {
    const nextEnabled = !isSoundEnabled();
    setSoundEnabled(nextEnabled);
  });
  setSoundEnabled(isSoundEnabled());

  // ---- Saldos bancários (com debounce) ----
  const savedBankBalances = JSON.parse(
    localStorage.getItem("monthly-bank-balances") || "[]",
  );
  const monthlyBankInputs = [
    ...document.querySelectorAll(".monthly-account-input"),
  ];
  const debouncedBankRefresh = debounce(refreshMonthlyBudgetDashboard, 200);

  monthlyBankInputs.forEach((input, index) => {
    const value = Number.parseFloat(
      String(savedBankBalances[index] ?? "0").replace(",", "."),
    );
    input.value = Number.isFinite(value) && value >= 0 ? String(value) : "";

    input.addEventListener("focus", () => {
      const currentValue = String(input.value).trim().replace(",", ".");
      if (currentValue !== "" && Number.parseFloat(currentValue) === 0) {
        input.value = "";
      }
    });

    input.addEventListener("input", () => {
      const isEmpty = String(input.value).trim() === "";
      input.value = isEmpty
        ? ""
        : String(input.value)
            .replace(/[^\d,.-]/g, "")
            .replace(",", ".");
      debouncedBankRefresh();
    });
  });

  // ---- Seletor de mês ----
  updateMonthDisplay();

  document
    .getElementById("btn-prev-month")
    ?.addEventListener("click", () => changeSelectedMonth(-1));
  document
    .getElementById("btn-next-month")
    ?.addEventListener("click", () => changeSelectedMonth(1));
  document
    .getElementById("btn-prev-month-list")
    ?.addEventListener("click", () => changeSelectedMonth(-1));
  document
    .getElementById("btn-next-month-list")
    ?.addEventListener("click", () => changeSelectedMonth(1));

  // ---- Filtros de data manuais ----
  const startInput = document.getElementById("filter-start-date");
  const endInput = document.getElementById("filter-end-date");
  if (startInput && endInput) {
    startInput.addEventListener("change", filterAndRenderTransactions);
    endInput.addEventListener("change", filterAndRenderTransactions);
  }

  // ---- Ordenação da tabela ----
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      try {
        setSort(th.dataset.key);
      } catch (err) {
        console.error("Erro ao ordenar:", err);
      }
    });
  });

  // ---- Delegação de delete (uma vez só) ----
  bindDeleteDelegation();

  // ---- Replicar no próximo mês ----
  const btnReplicar = document.getElementById("btn-copy-next-month");
  btnReplicar?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const { month, year } = getCurrentSelection();

    if (!window.allTransactions || window.allTransactions.length === 0) {
      showToast("Nenhum lançamento carregado para copiar.", "error");
      return;
    }

    const transacoesDoMes = window.allTransactions.filter((t) => {
      if (!t.due_date) return false;
      const [y, m] = t.due_date.split("-");
      return parseInt(m, 10) - 1 === month && parseInt(y, 10) === year;
    });

    if (transacoesDoMes.length === 0) {
      showToast("Não há lançamentos nesta aba para replicar.", "error");
      return;
    }

    let proximoMesHumano = month + 2;
    let anoAlvo = year;

    if (proximoMesHumano > 12) {
      proximoMesHumano = 1;
      anoAlvo += 1;
    }

    const nomesMeses = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];

    const mesAlvoNome = nomesMeses[proximoMesHumano - 1];

    const confirmacao = await showConfirmToast(
      `Deseja replicar ${transacoesDoMes.length} lançamento(s) de ${nomesMeses[month]} para ${mesAlvoNome} de ${anoAlvo}?`,
      { confirmLabel: "Replicar", iconClass: "ri-file-copy-2-line" },
    );
    if (!confirmacao) return;

    const transacoesReplicadas = transacoesDoMes.map((t) => {
      const parts = t.due_date.split("-");
      const diaOriginal = parts[2] ? parts[2].padStart(2, "0") : "10";

      const mesString = String(proximoMesHumano).padStart(2, "0");
      const anoString = String(anoAlvo);

      const novaDataFinal = `${anoString}-${mesString}-${diaOriginal}`;

      return {
        description: t.description,
        amount: t.amount,
        category: t.category,
        type: t.type || "expense",
        paid_status: "pending",
        due_date: novaDataFinal,
        created_at: `${novaDataFinal}T12:00:00.000Z`,
        date: novaDataFinal,
      };
    });

    try {
      btnReplicar.disabled = true;
      btnReplicar.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Replicando...`;

      await replicarTransacoesParaProximoMes(transacoesReplicadas);

      showToast(
        `Sucesso! Lançamentos replicados em ${mesAlvoNome}.`,
        "success",
      );

      window.allTransactions = await fetchTransactions();
      updateDashboardUI(window.allTransactions);
    } catch (err) {
      console.error(err);
      showToast("Erro ao replicar transações.", "error");
    } finally {
      btnReplicar.disabled = false;
      btnReplicar.innerHTML = `<i class="ri-file-copy-2-line"></i> Replicar no Próx. Mês`;
    }
  });

  // ---- Logout ----
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await logout();
  });

  // ---- Tema ----
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    toggleTheme();
    const isDark = document.documentElement.classList.contains("dark");
    updateFiiAllocationChartTheme(isDark);
  });

  // ---- Modal de transação ----
  document
    .getElementById("open-add-modal-btn")
    ?.addEventListener("click", () => {
      playUiSelectionSound();
      openModal(false);
    });

  const closeTransactionModalWithSound = () => {
    playUiUnselectionSound();
    closeModal();
  };

  document
    .getElementById("close-modal-btn")
    ?.addEventListener("click", closeTransactionModalWithSound);
  document
    .getElementById("cancel-modal-btn")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("transaction-modal")
    ?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        closeTransactionModalWithSound();
      }
    });

  // ---- Modal de avatar ----
  const avatarModal = document.getElementById("avatar-crop-modal");
  const closeAvatarModalWithSound = () => {
    playUiUnselectionSound();
    closeAvatarEditor();
  };
  document
    .getElementById("avatar-close-btn")
    ?.addEventListener("click", closeAvatarModalWithSound);
  document
    .getElementById("avatar-cancel-btn")
    ?.addEventListener("click", closeAvatarModalWithSound);
  avatarModal?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAvatarModalWithSound();
  });

  document
    .getElementById("avatar-load-btn")
    ?.addEventListener("click", async () => {
      const url = document.getElementById("avatar-url-input").value.trim();
      if (!/^https?:\/\//i.test(url)) {
        setAvatarEditorStatus(
          "Use um link que comece com http:// ou https://.",
          true,
        );
        return;
      }
      await setAvatarEditorImage(url);
    });

  document
    .getElementById("avatar-paste-btn")
    ?.addEventListener("click", async () => {
      try {
        const url = await navigator.clipboard.readText();
        document.getElementById("avatar-url-input").value = url;
        setAvatarEditorStatus(
          "Link colado. Clique em Carregar para continuar.",
        );
      } catch {
        setAvatarEditorStatus(
          "Não foi possível ler a área de transferência.",
          true,
        );
      }
    });

  document
    .getElementById("avatar-file-input")
    ?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setAvatarEditorStatus("Escolha uma imagem PNG, JPEG ou WebP.", true);
        return;
      }
      if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
        setAvatarEditorStatus("A imagem ultrapassa o limite de 8 MB.", true);
        return;
      }
      await setAvatarEditorImage(URL.createObjectURL(file));
    });

  ["avatar-zoom", "avatar-x", "avatar-y"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateAvatarPreview);
  });

  document.getElementById("avatar-save-btn")?.addEventListener("click", () => {
    try {
      const avatar = cropAvatarToDataUrl();
      localStorage.setItem(getAvatarStorageKey(), avatar);
      applySavedAvatar();
      showToast("Foto atualizada neste dispositivo.", "success");
      playSuccessSound();
      closeAvatarEditor();
    } catch (error) {
      setAvatarEditorStatus(error.message, true);
    }
  });

  // ---- Abas ----
  const tabButtons = document.querySelectorAll(".sidebar-tab");
  tabButtons.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedTab = tab.dataset.tab;
      if (selectedTab) {
        playUiSelectionSound();
        activateDashboardTab(selectedTab);
      }
    });
  });

  // ---- Busca e filtros (com debounce) ----
  document
    .getElementById("search-input")
    ?.addEventListener("input", debounce(filterAndRenderTransactions, 180));
  document
    .getElementById("filter-select")
    ?.addEventListener("change", filterAndRenderTransactions);
  document
    .getElementById("status-filter")
    ?.addEventListener("change", filterAndRenderTransactions);
  document.getElementById("sort-by-mobile")?.addEventListener("change", (e) => {
    setSort(e.target.value);
  });

  // ---- Notas ----
  document
    .getElementById("note-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const contentEl = document.getElementById("note-content");
      const content = contentEl?.value.trim();
      if (!content) {
        showToast("Digite uma anotação antes de salvar.", "error");
        return;
      }

      try {
        await insertNote({ content });
        if (contentEl) contentEl.value = "";
        showToast("Anotação salva!", "success");
        playSuccessSound();
        await loadDashboardData();
      } catch (err) {
        console.error(err);
        showToast("Erro ao salvar nota: " + err.message, "error");
      }
    });

  document
    .getElementById("notes-list")
    ?.addEventListener("click", async (event) => {
      const deleteButton = event.target.closest(".note-delete-btn");
      if (!deleteButton) return;

      const noteId = deleteButton.dataset.id;
      if (!noteId) return;

      const confirmacao = await showConfirmToast(
        "Deseja excluir esta anotação?",
        { confirmLabel: "Excluir", iconClass: "ri-delete-bin-line" },
      );
      if (!confirmacao) return;

      try {
        await removeNote(noteId);
        playDeleteSound();
        showToast("Anotação excluída.", "success");
        await loadDashboardData();
      } catch (err) {
        console.error(err);
        showToast("Erro ao excluir a anotação.", "error");
      }
    });

  // ---- FIIs ----
  const fiiForm = document.getElementById("fii-form");
  fiiForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ticker = normalizeFiiTicker(
      document.getElementById("fii-ticker")?.value,
    );
    const name = document.getElementById("fii-name")?.value.trim();
    const quantity =
      parseInt(document.getElementById("fii-quantity")?.value, 10) || 0;
    const averagePrice =
      parseFloat(document.getElementById("fii-average-price")?.value) || 0;
    const currentPrice =
      parseFloat(document.getElementById("fii-current-price")?.value) || 0;
    const dividends =
      parseFloat(document.getElementById("fii-dividends")?.value) || 0;

    if (
      !ticker ||
      !name ||
      quantity < 0 ||
      averagePrice < 0 ||
      currentPrice < 0 ||
      dividends < 0
    ) {
      showToast("Preencha corretamente todos os campos do FII.", "error");
      return;
    }

    const holdings = loadFiiHoldings(currentAppUser);
    const existingIndex = holdings.findIndex(
      (item) => normalizeFiiTicker(item.ticker) === ticker,
    );
    const newHolding = {
      ticker,
      name,
      quantity,
      averagePrice,
      currentPrice,
      dividends,
    };

    if (existingIndex >= 0) {
      holdings[existingIndex] = newHolding;
      showToast("FII atualizado com sucesso!", "success");
    } else {
      holdings.push(newHolding);
      showToast("FII salvo com sucesso!", "success");
    }

    playSuccessSound();
    saveFiiHoldings(currentAppUser, holdings);
    updateFiiUI(holdings);
    resetFiiForm();
  });

  // ---- Alternância Receita/Despesa ----
  const btnExpense = document.getElementById("btn-type-expense");
  const btnIncome = document.getElementById("btn-type-income");
  const transTypeInput = document.getElementById("trans-type");

  btnExpense?.addEventListener("click", () => {
    btnExpense.classList.add("active");
    btnIncome.classList.remove("active");
    if (transTypeInput) transTypeInput.value = "expense";
    updateCategoryDropdown("expense");
  });

  btnIncome?.addEventListener("click", () => {
    btnIncome.classList.add("active");
    btnExpense.classList.remove("active");
    if (transTypeInput) transTypeInput.value = "income";
    updateCategoryDropdown("income");
  });

  document.getElementById("trans-category")?.addEventListener("change", (e) => {
    const customInput = document.getElementById("trans-custom-category");
    if (!customInput) return;

    if (e.target.value === "Outros") {
      customInput.style.display = "block";
      customInput.required = true;
    } else {
      customInput.style.display = "none";
      customInput.required = false;
      customInput.value = "";
    }
  });

  // ---- Submit do form (criação/edição) ----
  document
    .getElementById("transaction-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const editId = form.dataset.editId;

      const rawAmount = document.getElementById("trans-amount").value;
      const cleanAmount =
        parseFloat(String(rawAmount).replace(/[^0-9.-]/g, "")) || 0;

      const fallbackType = document
        .getElementById("btn-type-income")
        ?.classList.contains("active")
        ? "income"
        : "expense";
      const finalType = transTypeInput ? transTypeInput.value : fallbackType;

      let finalCategory = document.getElementById("trans-category").value;
      if (finalCategory === "Outros") {
        const customValue = document
          .getElementById("trans-custom-category")
          .value.trim();
        if (customValue) finalCategory = customValue;
      }

      const transactionData = {
        description: document.getElementById("trans-desc").value,
        amount: cleanAmount,
        category: finalCategory,
        date: document.getElementById("trans-date").value,
        type: finalType,
        paid_status: document.getElementById("trans-paid-status").value,
        due_date: document.getElementById("trans-due-date").value || null,
        recurrence: document.getElementById("trans-recurrence").value || null,
        recurrence_end:
          document.getElementById("trans-recurrence-end").value || null,
      };

      try {
        if (editId) {
          const { error } = await supabase
            .from("transactions")
            .update(transactionData)
            .eq("id", editId);
          if (error) throw error;
          showToast("Transação atualizada!", "success");
        } else {
          await insertTransaction(transactionData);
          showToast("Lançamento realizado!", "success");
        }

        playSuccessSound();
        closeModal();
        await loadDashboardData();
      } catch (err) {
        console.error(err);
        showToast("Erro ao processar: " + err.message, "error");
      }
    });
});

// Recarrega orçamentos quando o mês muda
let lastMonthKey = '';
async function watchMonthChanges() {
    const { month, year } = getCurrentSelection();
    const key = `${year}-${month}`;
    if (key === lastMonthKey) return;
    lastMonthKey = key;

    try {
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        currentBudgets = await fetchBudgets(monthKey);
        renderBudgets(currentBudgets, window.allTransactions || [], { month, year });
    } catch (err) {
        console.error('Erro ao recarregar orçamentos:', err);
    }
}

setInterval(watchMonthChanges, 400);

// =====================================================================
// EVENTOS GLOBAIS
// =====================================================================

window.addEventListener('transactions-updated', async () => {
    updateMonthDisplay();
    updateDashboardUI(window.allTransactions || []);
    refreshMonthlyBudgetDashboard();

    // Re-renderiza orçamentos com os dados novos
    const { month, year } = getCurrentSelection();
    renderBudgets(currentBudgets, window.allTransactions || [], { month, year });
});

// Inicialização
initTheme();

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    currentAppUser = session.user;
    showDashboardScreen(session.user, false);
    applySavedAvatar(session.user);
    loadDashboardData();
    loadFiiData();
  } else {
    showLoginScreen();
  }
});

document.getElementById("user-avatar")?.addEventListener("click", () => {
  playUiSelectionSound();
  openAvatarEditor();
});

// =====================================================================
// ABAS
// =====================================================================

function activateDashboardTab(tabId) {
    document.querySelectorAll('.tab-page').forEach(page => {
        page.classList.toggle('active', page.id === `tab-${tabId}`);
    });
    document.querySelectorAll('.sidebar-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tabId);
    });

        if (tabId === 'overview') {
        filterAndRenderTransactions();
        const selection = getCurrentSelection();
        renderBudgets(currentBudgets, window.allTransactions || [], selection);
        renderGoals(currentGoals);
        updateInsights(window.allTransactions || [], selection);
        renderProjection(window.allTransactions || [], selection);
    }
    if (tabId === 'monthly') {
        refreshMonthlyBudgetDashboard();
    }
}

activateDashboardTab("overview");

// =====================================================================
// ATALHOS
// =====================================================================

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modal = document.getElementById("transaction-modal");
    if (modal?.classList.contains("active")) {
      closeModal();
    }
    return;
  }

  if (event.key === "F1") {
    event.preventDefault();
    if (
      !document
        .getElementById("transaction-modal")
        ?.classList.contains("active")
    ) {
      playUiSelectionSound();
      openModal(false);
    }
  }
});

// =====================================================================
// DADOS DO DASHBOARD
// =====================================================================

async function loadDashboardData() {
    try {
        const { month, year } = getCurrentSelection();

        // Materializa desde a última vez que o usuário logou (ou desde o mês anterior)
        const lastSeen = localStorage.getItem('vaulta-last-materialized');
        let sinceDate = null;
        if (lastSeen) {
            const [ly, lm] = lastSeen.split('-').map(Number);
            sinceDate = new Date(ly, lm - 1, 1);
        } else {
            sinceDate = new Date(year, month - 1, 1); // mês anterior
        }

        await materializeRecurrences(year, month, sinceDate);

        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        localStorage.setItem('vaulta-last-materialized', monthKey);

        const [transactions, notes, budgets, goals] = await Promise.all([
            fetchTransactions(),
            fetchNotes(),
            fetchBudgets(monthKey),
            fetchGoals(),
        ]);

        currentBudgets = budgets;
        currentGoals = goals;
        currentNotesCache = notes;

        updateDashboardUI(transactions);
        renderNotes(notes);
        renderBudgets(currentBudgets, transactions, { month, year });
        renderGoals(currentGoals);

        checkDueDates(transactions);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        const message = String(err?.message || '').toLowerCase();
        showToast(
            message.includes('failed to fetch') || message.includes('network')
                ? "Conectado, mas os dados não puderam ser carregados."
                : "Não foi possível carregar os dados do painel.",
            "error"
        );
    }
}

function renderNotes(notes) {
  const notesList = document.getElementById("notes-list");
  if (!notesList) return;

  if (!notes || notes.length === 0) {
    notesList.innerHTML = `<div class="notes-empty">Nenhuma anotação registrada. Use o formulário ao lado para salvar uma nota.</div>`;
    return;
  }

  notesList.innerHTML = notes
    .map((note) => {
      const createdAt = note.created_at
        ? new Date(note.created_at).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "";
      return `
            <div class="note-card glass">
                <div class="note-card-content">${sanitizeText(note.content)}</div>
                <div class="note-card-footer">
                    <span class="note-meta">${createdAt}</span>
                    <button type="button" class="btn-secondary note-delete-btn" data-id="${note.id}"><i class="ri-delete-bin-line"></i> Excluir</button>
                </div>
            </div>
        `;
    })
    .join("");
}

// =====================================================================
// FIIs
// =====================================================================

function normalizeFiiTicker(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function loadFiiHoldings(user) {
  try {
    const storageKey = user?.email
      ? `fii-holdings:${user.email}`
      : "fii-holdings:anon";
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const holdings = JSON.parse(raw);
    return Array.isArray(holdings) ? holdings : [];
  } catch (err) {
    console.error("Erro ao carregar holdings de FIIs:", err);
    return [];
  }
}

function saveFiiHoldings(user, holdings) {
  try {
    const storageKey = user?.email
      ? `fii-holdings:${user.email}`
      : "fii-holdings:anon";
    localStorage.setItem(storageKey, JSON.stringify(holdings));
  } catch (err) {
    console.error("Erro ao salvar holdings de FIIs:", err);
  }
}

function formatFiiCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function updateFiiUI(holdings) {
  const totalValue = holdings.reduce(
    (sum, item) =>
      sum + Number(item.currentPrice || 0) * Number(item.quantity || 0),
    0,
  );
  const totalDividends = holdings.reduce(
    (sum, item) => sum + Number(item.dividends || 0),
    0,
  );
  const averageYield = totalValue > 0 ? (totalDividends / totalValue) * 100 : 0;

  const totalValueEl = document.getElementById("fii-total-value");
  const monthlyDividendsEl = document.getElementById("fii-monthly-dividends");
  const averageYieldEl = document.getElementById("fii-average-yield");
  const countEl = document.getElementById("fii-count");
  const tbody = document.getElementById("fii-holdings-tbody");
  const emptyState = document.getElementById("fii-empty-state");

  if (totalValueEl)
    totalValueEl.textContent = `R$ ${formatFiiCurrency(totalValue)}`;
  if (monthlyDividendsEl)
    monthlyDividendsEl.textContent = `R$ ${formatFiiCurrency(totalDividends)}`;
  if (averageYieldEl)
    averageYieldEl.textContent = `${averageYield.toFixed(2)}%`;
  if (countEl) countEl.textContent = String(holdings.length);

  if (!tbody) return;

  if (holdings.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    renderFiiAllocationChart([]);
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = holdings
    .map((item) => {
      const totalItem =
        Number(item.currentPrice || 0) * Number(item.quantity || 0);
      return `
            <tr class="animate-fade">
                <td>${sanitizeText(item.name)} (${sanitizeText(item.ticker)})</td>
                <td>${Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
                <td>R$ ${formatFiiCurrency(item.averagePrice)}</td>
                <td>R$ ${formatFiiCurrency(item.currentPrice)}</td>
                <td>R$ ${formatFiiCurrency(totalItem)}</td>
                <td>R$ ${formatFiiCurrency(item.dividends)}</td>
                <td><button type="button" class="btn-secondary btn-edit-fii" data-ticker="${sanitizeText(item.ticker)}">Editar</button></td>
            </tr>
        `;
    })
    .join("");

  setupFiiEditButtons();
  renderFiiAllocationChart(holdings);
}

function setupFiiEditButtons() {
  document.querySelectorAll(".btn-edit-fii").forEach((btn) => {
    btn.removeEventListener("click", handleFiiEditClick);
    btn.addEventListener("click", handleFiiEditClick);
  });
}

function handleFiiEditClick(event) {
  const ticker = normalizeFiiTicker(event.currentTarget.dataset.ticker);
  const holdings = loadFiiHoldings(currentAppUser);
  const holding = holdings.find(
    (item) => normalizeFiiTicker(item.ticker) === ticker,
  );
  if (!holding) return;

  document.getElementById("fii-ticker").value = holding.ticker;
  document.getElementById("fii-name").value = holding.name;
  document.getElementById("fii-quantity").value = holding.quantity;
  document.getElementById("fii-average-price").value = holding.averagePrice;
  document.getElementById("fii-current-price").value = holding.currentPrice;
  document.getElementById("fii-dividends").value = holding.dividends;
}

function resetFiiForm() {
  const fiiForm = document.getElementById("fii-form");
  if (fiiForm) fiiForm.reset();
}

function loadFiiData() {
  const holdings = loadFiiHoldings(currentAppUser);
  updateFiiUI(holdings);
}

function sanitizeText(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}
