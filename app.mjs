import dataEntries from "./iching-data.mjs";
import { createDataIndex, generateNumberDivination } from "./divination-core.mjs";

const LINE_LABELS = ["上爻", "五爻", "四爻", "三爻", "二爻", "初爻"];
const CHANGE_LABELS = {
  0: "静卦，无变爻",
  1: "动爻一处",
  2: "动爻两处",
  3: "动爻三处",
  4: "动爻四处",
  5: "动爻五处",
  6: "六爻皆变",
};
const RITUAL_LINE_LABELS = ["", "初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
const ROUND_LABELS = ["一", "二", "三", "四", "五", "六"];
const COIN_PATTERNS = {
  shaoyin: [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
  ],
  shaoyang: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};

if (typeof document !== "undefined") {
  void initPage();
}

async function initPage() {
  const refs = getRefs();

  configureInputs(refs);
  setMessage(refs, "loading", "正在装载卦辞数据……");
  refs.form.addEventListener("submit", (event) => {
    event.preventDefault();
    renderCurrentInput(refs);
  });

  try {
    refs.dataIndex = loadDataIndex();
    refs.submitButton.disabled = false;
    renderCurrentInput(refs);
  } catch (error) {
    refs.submitButton.disabled = true;
    refs.resultPanel.hidden = true;
    setMessage(refs, "error", buildLoadErrorMessage(error));
  }
}

function getRefs() {
  return {
    form: document.querySelector("#divination-form"),
    input: document.querySelector("#number-input"),
    commandInput: document.querySelector("#command-input"),
    submitButton: document.querySelector("#submit-button"),
    message: document.querySelector("#message"),
    fieldHint: document.querySelector(".field-hint"),
    resultPanel: document.querySelector("#result-panel"),
    resultTitle: document.querySelector("#result-title"),
    seedNote: document.querySelector("#seed-note"),
    resultNote: document.querySelector("#result-note"),
    ritualTimeline: document.querySelector("#ritual-timeline"),
    baseName: document.querySelector("#base-name"),
    changedName: document.querySelector("#changed-name"),
    baseMeta: document.querySelector("#base-meta"),
    changedMeta: document.querySelector("#changed-meta"),
    baseHexagram: document.querySelector("#base-hexagram"),
    changedHexagram: document.querySelector("#changed-hexagram"),
    resultTexts: document.querySelector("#result-texts"),
    dataIndex: null,
  };
}

function configureInputs(refs) {
  refs.input.inputMode = "numeric";
  refs.input.placeholder = "如 46";

  if (refs.commandInput) {
    refs.commandInput.inputMode = "numeric";
    refs.commandInput.placeholder = "如 46";
  }

  if (refs.fieldHint) {
    refs.fieldHint.textContent = "保留一种方式即可，另一项留空。";
  }
}

function loadDataIndex() {
  return createDataIndex(dataEntries);
}

function renderCurrentInput(refs) {
  if (!refs.dataIndex) {
    return;
  }

  try {
    const inputState = resolveInput(refs);
    const result = generateNumberDivination(inputState.rawInput, refs.dataIndex);
    const baseTitle = extractHexagramTitle(lookupEntry(refs.dataIndex, `div${result.baseBits}_0`));
    const changedTitle = extractHexagramTitle(
      lookupEntry(refs.dataIndex, `div${result.changedBits}_0`),
    );

    refs.resultPanel.hidden = false;
    refs.resultTitle.textContent =
      result.baseBits === result.changedBits
        ? `得 ${baseTitle}`
        : `得 ${baseTitle}，之 ${changedTitle}`;
    refs.seedNote.textContent = `取数方式：${inputState.modeLabel}`;
    refs.resultNote.textContent =
      result.resultTexts.length > 1 ? "两条断辞并列时，以前辞为主。" : "本次得一条断辞。";

    refs.baseName.textContent = baseTitle;
    refs.changedName.textContent = changedTitle;
    refs.baseMeta.textContent = `卦象：${result.baseSymbol} · ${formatChangeLabel(result.changingCount)}`;
    refs.changedMeta.textContent =
      result.baseBits === result.changedBits ? "之卦与本卦相同" : `卦象：${result.changedSymbol}`;
    renderRitual(refs, result.lines);
    refs.baseHexagram.innerHTML = createHexagramMarkup(result.lines, "base");
    refs.changedHexagram.innerHTML = createHexagramMarkup(result.lines, "changed");
    refs.resultTexts.innerHTML = createOracleMarkup(result);

    setMessage(refs, "ready", `起卦完成：${refs.resultTitle.textContent}`);
  } catch (error) {
    refs.resultPanel.hidden = true;
    setMessage(refs, "error", error.message);
  }
}

function renderRitual(refs, lines) {
  if (!refs.ritualTimeline) {
    return;
  }

  refs.ritualTimeline.innerHTML = createRitualMarkup(lines);
}

function resolveInput(refs) {
  const direct = refs.input?.value.trim() ?? "";
  const command = refs.commandInput?.value.trim() ?? "";

  if (direct !== "" && command !== "") {
    throw new TypeError("两种方式请只填写一项。");
  }

  if (command !== "") {
    if (!/^\d+$/.test(command)) {
      throw new TypeError("命令式起卦只填写数字。");
    }

    return {
      rawInput: `[${command}]`,
      modeLabel: "命令式起卦",
    };
  }

  if (direct === "") {
    throw new TypeError("请输入一个数字。");
  }

  if (!/^\d+$/.test(direct)) {
    throw new TypeError("数字起卦只填写数字。");
  }

  return {
    rawInput: direct,
    modeLabel: "数字起卦",
  };
}

function createRitualMarkup(lines) {
  return [...lines]
    .sort((left, right) => left.row - right.row)
    .map((line, index) => createTossRoundMarkup(line, index))
    .join("");
}

function createTossRoundMarkup(line, roundIndex) {
  const detail = describeToss(line);
  const coins = detail.coins
    .map((face, coinIndex) => createCoinMarkup(face, roundIndex, coinIndex))
    .join("");

  return `
    <article class="toss-round" style="--round-delay:${roundIndex * 110}ms">
      <div class="toss-round-head">
        <div>
          <span class="toss-order">第${ROUND_LABELS[roundIndex]}掷</span>
          <h4>${RITUAL_LINE_LABELS[line.row]}</h4>
        </div>
        <span class="toss-motion ${detail.moving ? "toss-motion--moving" : "toss-motion--still"}">
          ${detail.moving ? "动爻" : "静爻"}
        </span>
      </div>
      <div class="coin-row">${coins}</div>
      <div class="toss-result">
        <strong>${detail.name}</strong>
        <p>${detail.note}</p>
      </div>
    </article>
  `;
}

function describeToss(line) {
  if (line.base === 1 && line.changed === 0) {
    return {
      name: "老阳",
      moving: true,
      coins: [1, 1, 1],
      note: "三阳俱现，本卦为阳，之卦转阴。",
    };
  }

  if (line.base === 0 && line.changed === 0) {
    return {
      name: "少阴",
      moving: false,
      coins: pickCoinPattern(COIN_PATTERNS.shaoyin, line.row),
      note: "二阳一阴，阴爻守静。",
    };
  }

  if (line.base === 1 && line.changed === 1) {
    return {
      name: "少阳",
      moving: false,
      coins: pickCoinPattern(COIN_PATTERNS.shaoyang, line.row),
      note: "一阳二阴，阳爻守静。",
    };
  }

  return {
    name: "老阴",
    moving: true,
    coins: [0, 0, 0],
    note: "三阴俱现，本卦为阴，之卦转阳。",
  };
}

function pickCoinPattern(patterns, row) {
  return patterns[(row - 1) % patterns.length];
}

function createCoinMarkup(face, roundIndex, coinIndex) {
  const faceLabel = face === 1 ? "阳" : "阴";
  const coinDelay = roundIndex * 180 + coinIndex * 90;

  return `
    <span class="coin coin--${face === 1 ? "yang" : "yin"}" style="--coin-delay:${coinDelay}ms">
      <span class="coin-disc" aria-hidden="true">
        <span class="coin-glyph">${faceLabel}</span>
      </span>
    </span>
  `;
}

function createHexagramMarkup(lines, mode) {
  const rows = lines
    .map((line, index) => {
      const value = mode === "base" ? line.base : line.changed;
      const motion = line.base !== line.changed;

      return `
        <li class="hexagram-row">
          <span class="row-label">${LINE_LABELS[index]}</span>
          ${createYaoMarkup(value, motion)}
          <span class="yao-marker ${motion ? "" : "yao-marker--still"}">${motion ? "动" : "静"}</span>
        </li>
      `;
    })
    .join("");

  return `<ol class="hexagram">${rows}</ol>`;
}

function createYaoMarkup(value, motion) {
  if (value === 1) {
    return `
      <div class="yao yao--yang">
        <span class="yao-bar"></span>
        ${motion ? '<span class="yao-marker-dot" aria-hidden="true"></span>' : ""}
      </div>
    `;
  }

  return `
    <div class="yao yao--yin">
      <span class="yao-bar"></span>
      <span class="yao-gap"></span>
      <span class="yao-bar"></span>
      ${motion ? '<span class="yao-marker-dot" aria-hidden="true"></span>' : ""}
    </div>
  `;
}

function createOracleMarkup(result) {
  return result.resultTexts
    .map((text, index) => {
      const title = result.resultNames[index];
      return `
        <article class="oracle-entry">
          <div class="oracle-entry-title">
            <span class="oracle-index">${index + 1}</span>
            <h4>${title}</h4>
          </div>
          <p>${text}</p>
        </article>
      `;
    })
    .join("");
}

function formatChangeLabel(count) {
  return CHANGE_LABELS[count] ?? "卦象已成";
}

function buildLoadErrorMessage(error) {
  return `卦辞数据未能载入：${error.message}`;
}

function setMessage(refs, state, message) {
  refs.message.dataset.state = state;
  refs.message.textContent = message;
}

function lookupEntry(dataIndex, code) {
  const entry = dataIndex.get(code);

  if (!entry) {
    throw new Error(`缺少卦辞数据：${code}`);
  }

  return entry;
}

function extractHexagramTitle(entry) {
  return entry.words.split(/\s+/)[0];
}
