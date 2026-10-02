const $ = (selector, parent = document) => parent.querySelector(selector);
const currency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 });
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const state = [
  { ticker: 'หุ้น A', entry: 2, stop: 1.9, target: 2.3, allocation: 800, type: 'baht' },
  { ticker: 'หุ้น B', entry: 5, stop: 4.75, target: 5.75, allocation: 800, type: 'baht' },
  { ticker: 'หุ้น C', entry: 10, stop: 9.5, target: 11.5, allocation: 800, type: 'baht' }
];

function value(id) { return Math.max(0, Number($(id).value) || 0); }
function fmtMoney(n) { return currency.format(Number.isFinite(n) ? n : 0); }
function fmtNumber(n) { return number.format(Number.isFinite(n) ? n : 0); }
function ratio(value) { return value > 0 && Number.isFinite(value) ? `1:${fmtNumber(value)}` : '—'; }

function calculateTrade(trade, capital, minimumR) {
  const { entry, stop, target, allocation, type } = trade;
  const missing = !entry || !stop || !target || !allocation;
  if (missing) return { valid: false, message: 'กรอกข้อมูลให้ครบก่อนคำนวณ' };
  if (entry <= 0) return { valid: false, message: 'ราคาเข้าต้องมากกว่า 0' };
  if (stop < 0 || target < 0) return { valid: false, message: 'ราคา Stop Loss และ Take Profit ต้องไม่ติดลบ' };
  if (stop >= entry) return { valid: false, message: 'Stop Loss ต้องต่ำกว่าราคาเข้า สำหรับสถานะ Long' };
  if (target <= entry) return { valid: false, message: 'Take Profit ต้องสูงกว่าราคาเข้า สำหรับสถานะ Long' };
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  if (riskPerShare <= 0 || rewardPerShare <= 0) return { valid: false, message: 'Risk และ Reward ต้องมากกว่า 0' };
  const allocatedRisk = type === 'percent' ? capital * allocation / 100 : allocation;
  if (allocatedRisk <= 0) return { valid: false, message: 'Risk ที่จัดสรรต้องมากกว่า 0' };
  // Adding a tiny epsilon corrects binary floating-point artifacts (e.g. 800 / 0.1
  // becoming 7999.999999999) without changing the intended floor operation.
  const shares = Math.max(0, Math.floor(allocatedRisk / riskPerShare + 1e-9));
  const maximumLoss = shares * riskPerShare;
  const targetProfit = shares * rewardPerShare;
  const r = rewardPerShare / riskPerShare;
  return { valid: true, riskPerShare, rewardPerShare, allocatedRisk, shares, maximumLoss, targetProfit, investment: shares * entry, riskPercent: riskPerShare / entry * 100, rewardPercent: rewardPerShare / entry * 100, r, passes: r >= minimumR };
}

function createTrade(data = { ticker: '', entry: '', stop: '', target: '', allocation: '', type: 'baht' }) {
  const card = $('#tradeTemplate').content.firstElementChild.cloneNode(true);
  const inputs = { ticker: $('.ticker', card), entry: $('.entry', card), stop: $('.stop', card), target: $('.target', card), allocation: $('.allocated-risk', card), type: $('.risk-type', card) };
  Object.entries(inputs).forEach(([key, input]) => input.value = data[key] ?? '');
  Object.values(inputs).forEach(input => input.addEventListener('input', update));
  inputs.type.addEventListener('change', update);
  $('.delete-button', card).addEventListener('click', () => { card.remove(); update(); });
  $('#tradeList').append(card);
}

function readTrade(card) { return { ticker: $('.ticker', card).value.trim(), entry: Number($('.entry', card).value), stop: Number($('.stop', card).value), target: Number($('.target', card).value), allocation: Number($('.allocated-risk', card).value), type: $('.risk-type', card).value }; }
function setResult(card, selector, text) { $(selector, card).textContent = text; }

function update() {
  const capital = value('#capital');
  const limitPercent = value('#riskLimitPercent');
  const minimumR = Math.max(.1, value('#minimumR'));
  const limit = capital * limitPercent / 100;
  let totalRisk = 0, totalProfit = 0, totalInvestment = 0;
  [...document.querySelectorAll('.trade-card')].forEach((card, index) => {
    $('.trade-number', card).textContent = `รายการที่ ${index + 1}`;
    const result = calculateTrade(readTrade(card), capital, minimumR);
    const validation = $('.validation', card);
    validation.textContent = result.valid ? '' : result.message;
    validation.classList.toggle('show', !result.valid);
    if (!result.valid) { ['.risk-share','.risk-percent','.shares','.maximum-loss','.investment','.reward-share','.reward-percent','.target-profit','.r-ratio'].forEach(s => setResult(card,s,'—')); $('.r-status',card).textContent=''; return; }
    setResult(card,'.risk-share',fmtMoney(result.riskPerShare)); setResult(card,'.risk-percent',`${fmtNumber(result.riskPercent)}%`);
    setResult(card,'.shares',`${fmtNumber(result.shares)} หุ้น`); setResult(card,'.maximum-loss',fmtMoney(result.maximumLoss));
    setResult(card,'.investment',fmtMoney(result.investment)); setResult(card,'.reward-share',fmtMoney(result.rewardPerShare)); setResult(card,'.reward-percent',`${fmtNumber(result.rewardPercent)}%`);
    setResult(card,'.target-profit',fmtMoney(result.targetProfit)); setResult(card,'.r-ratio',ratio(result.r));
    const status = $('.r-status', card); status.textContent = result.passes ? 'ผ่านเกณฑ์' : 'R ต่ำกว่าเกณฑ์'; status.classList.toggle('low', !result.passes);
    totalRisk += result.maximumLoss; totalProfit += result.targetProfit; totalInvestment += result.investment;
  });
  const remaining = limit - totalRisk, aggregate = totalRisk > 0 ? totalProfit / totalRisk : 0, overLimit = totalRisk > limit;
  $('#riskLimitMoney').textContent = fmtMoney(limit);
  $('#dCapital').textContent = fmtMoney(capital); $('#dRiskLimit').textContent = fmtMoney(limit); $('#dRiskLimitPercent').textContent = `${fmtNumber(limitPercent)}% ของเงินทุน`;
  $('#dRiskUsed').textContent = fmtMoney(totalRisk); $('#dRiskUsedPercent').textContent = `${fmtNumber(capital ? totalRisk / capital * 100 : 0)}% ของเงินทุน`;
  $('#dRiskRemain').textContent = fmtMoney(Math.max(0, remaining)); $('#dInvestment').textContent = fmtMoney(totalInvestment); $('#dInvestmentPercent').textContent = `${fmtNumber(capital ? totalInvestment / capital * 100 : 0)}% ของเงินทุน`;
  $('#dTargetProfit').textContent = fmtMoney(totalProfit); $('#dTargetProfitPercent').textContent = `${fmtNumber(capital ? totalProfit / capital * 100 : 0)}% ของเงินทุน`; $('#dAggregateR').textContent = ratio(aggregate);
  $('#dStatus').textContent = overLimit ? 'เกิน Risk Limit' : 'ภายใน Risk Limit'; $('#dStatus').style.color = overLimit ? 'var(--red)' : 'var(--green)'; $('#dStatusDetail').textContent = overLimit ? `เกิน ${fmtMoney(-remaining)}` : `เหลือ ${fmtMoney(remaining)}`;
  $('#sRisk').textContent = fmtMoney(totalRisk); $('#sRiskPercent').textContent = `${fmtNumber(capital ? totalRisk / capital * 100 : 0)}% ของเงินทุน`; $('#sLimit').textContent = fmtMoney(limit); $('#sRemaining').textContent = overLimit ? `เกิน ${fmtMoney(-remaining)}` : `เหลือ ${fmtMoney(remaining)}`; $('#sProfit').textContent = fmtMoney(totalProfit); $('#sProfitPercent').textContent = `${fmtNumber(capital ? totalProfit / capital * 100 : 0)}% ของเงินทุน`; $('#sAggregateR').textContent = ratio(aggregate);
  $('#warning').hidden = !overLimit; $('#warningText').textContent = `เกินขีดจำกัดอยู่ ${fmtMoney(-remaining)} กรุณาปรับ Risk ที่จัดสรรหรือรายการเทรด`;
}

$('#addTrade').addEventListener('click', () => { createTrade(); update(); document.querySelector('.trade-card:last-child input')?.focus(); });
['#capital','#riskLimitPercent','#minimumR'].forEach(id => $(id).addEventListener('input', update));
state.forEach(createTrade); update();
