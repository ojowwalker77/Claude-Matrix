// Premium Matrix Rain Renderer - Zero Flicker, Single Buffer Write

import { KATAKANA, PORTALS, INTRO_LINES, STICK_FIGURES, RABBIT_ART, CONTRIBUTORS } from './content.js';
import { GameState, getPortalContent, Player } from './game.js';

// ANSI escape sequences
const ESC = '\x1b';
const ENTER_ALT = `${ESC}[?1049h`;
const EXIT_ALT = `${ESC}[?1049l`;
const HOME = `${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const RESET = `${ESC}[0m`;

// Color palette: WHITE, ORANGE, DIM, and GREEN for glitch
const WHITE = `${ESC}[97m`;
const ORANGE = `${ESC}[38;5;208m`;
const DIM = `${ESC}[38;5;238m`;
const VERY_DIM = `${ESC}[38;5;235m`;
const GREEN = `${ESC}[38;5;46m`;         // Matrix green for glitch
const BRIGHT_GREEN = `${ESC}[38;5;82m`;  // Bright green for glitch

// Screen buffer cell
interface Cell {
  char: string;
  color: string;
}

// Create empty screen buffer
function createBuffer(width: number, height: number): Cell[][] {
  const buffer: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ char: ' ', color: '' });
    }
    buffer.push(row);
  }
  return buffer;
}

// Set character in buffer (safely) - floors coordinates for float support
function setCell(buffer: Cell[][], x: number, y: number, char: string, color: string): void {
  const floorY = Math.floor(y);
  const floorX = Math.floor(x);
  if (floorY >= 0 && floorY < buffer.length && floorX >= 0 && floorX < buffer[0]!.length) {
    buffer[floorY]![floorX] = { char, color };
  }
}

// Glitch state
let glitchFrames = 0;
let isGlitching = false;
let glitchDuration = 0;
let nextGlitch = 50 + Math.floor(Math.random() * 100);

function updateGlitch(): void {
  glitchFrames++;
  if (!isGlitching && glitchFrames >= nextGlitch) {
    isGlitching = true;
    glitchDuration = 10 + Math.floor(Math.random() * 5);  // 0.5-0.75 sec at 20fps
  }
  if (isGlitching) {
    glitchDuration--;
    if (glitchDuration <= 0) {
      isGlitching = false;
      glitchFrames = 0;
      nextGlitch = 50 + Math.floor(Math.random() * 100);
    }
  }
}

function glitchColor(color: string): string {
  if (!isGlitching) return color;
  if (color === WHITE) return BRIGHT_GREEN;
  if (color === ORANGE) return GREEN;
  if (color === DIM) return GREEN;
  return GREEN;
}

// Rain system
interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;  // Variable speed for natural feel
  chars: string[];
}

let drops: RainDrop[] = [];
let rainDensity = 0.2;  // Default density

function randomChar(): string {
  if (KATAKANA.length === 0) return '*';
  return KATAKANA[Math.floor(Math.random() * KATAKANA.length)]!;
}

export function initRain(width: number, height: number): void {
  drops = [];
  const initialCount = Math.floor(width * 0.25);
  for (let i = 0; i < initialCount; i++) {
    // Spread drops across full screen height and beyond (negative y)
    const startY = Math.floor(Math.random() * (height + 30)) - 30;
    drops.push(createDrop(
      Math.floor(Math.random() * width),
      startY,
    ));
  }
}

// Boost rain density for finale
export function setRainDensity(density: number): void {
  rainDensity = density;
}

function createDrop(x: number, y: number): RainDrop {
  const length = 6 + Math.floor(Math.random() * 12);
  const speed = 0.5 + Math.random() * 1;  // Speed varies 0.5-1.5
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(randomChar());
  }
  return { x, y, length, speed, chars };
}

export function tickRain(width: number, height: number): void {
  // Move drops at their individual speeds
  for (const drop of drops) {
    drop.y += drop.speed;
    if (Math.random() < 0.15) {
      const idx = Math.floor(Math.random() * drop.chars.length);
      drop.chars[idx] = randomChar();
    }
  }

  drops = drops.filter(d => d.y - d.length < height);

  const targetCount = Math.floor(width * rainDensity);
  // Spawn gradually - max 2 new drops per tick for natural feel
  let spawned = 0;
  while (drops.length < targetCount && spawned < 2) {
    const x = Math.floor(Math.random() * width);
    if (!drops.some(d => d.x === x && d.y < 10)) {
      // Start at varying negative positions for staggered entry
      drops.push(createDrop(x, -Math.floor(Math.random() * 15)));
      spawned++;
    }
  }
}

function renderRainToBuffer(buffer: Cell[][]): void {
  const height = buffer.length;

  for (const drop of drops) {
    for (let i = 0; i < drop.length; i++) {
      const y = drop.y - i;
      if (y >= 0 && y < height - 1) {  // -1 for footer
        const char = drop.chars[i % drop.chars.length]!;
        let color: string;
        if (i === 0) {
          color = WHITE;
        } else if (i < 3) {
          color = ORANGE;
        } else if (i < 6) {
          color = DIM;
        } else {
          color = VERY_DIM;
        }
        setCell(buffer, drop.x, y, char, glitchColor(color));
      }
    }
  }
}

// Render stick figure player
function renderPlayer(buffer: Cell[][], player: Player): void {
  const figure = STICK_FIGURES[player.direction];
  const baseY = player.y;
  const baseX = player.x;

  // Brightness based on momentum (brighter when just moved)
  const color = player.momentum < 3 ? WHITE :
                player.momentum < 6 ? ORANGE : DIM;

  for (let dy = -1; dy <= 1; dy++) {
    const row = figure[dy + 1]!;
    const screenY = baseY + dy;

    for (let dx = -1; dx <= 1; dx++) {
      const char = row[dx + 1];
      const screenX = baseX + dx;
      if (char && char !== ' ') {
        setCell(buffer, screenX, screenY, char, glitchColor(color));
      }
    }
  }

  // Trail effect when recently moved
  if (player.momentum < 2 && player.direction !== 'idle') {
    const trailChar = '·';
    let trailX = baseX;
    let trailY = baseY;

    switch (player.direction) {
      case 'left': trailX = baseX + 2; break;
      case 'right': trailX = baseX - 2; break;
      case 'up': trailY = baseY + 2; break;
      case 'down': trailY = baseY - 2; break;
    }
    setCell(buffer, trailX, trailY, trailChar, VERY_DIM);
  }
}

// Render rabbit (3 lines ASCII art)
function renderRabbit(buffer: Cell[][], x: number, y: number, looking: 'right' | 'left' = 'right'): void {
  const art = looking === 'right' ? RABBIT_ART.right : RABBIT_ART.left;

  for (let line = 0; line < art.length; line++) {
    const row = art[line]!;
    const drawY = y - 1 + line;  // Center vertically on y
    const xOffset = Math.floor(row.length / 2);

    for (let i = 0; i < row.length; i++) {
      if (row[i] !== ' ') {
        setCell(buffer, x - xOffset + i, drawY, row[i]!, WHITE);
      }
    }
  }
}

// Render portals
function renderPortals(buffer: Cell[][], state: GameState): void {
  for (const portal of state.portals) {
    const px = portal.pos.x;
    const py = portal.pos.y;

    // [N] bracket format
    const bracketColor = portal.visited ? VERY_DIM : ORANGE;
    const numColor = portal.visited ? VERY_DIM :
                     (state.currentPortalId === portal.id ? WHITE : ORANGE);
    const char = portal.visited ? '✓' : String(portal.id);

    setCell(buffer, px - 1, py, '[', glitchColor(bracketColor));
    setCell(buffer, px, py, char, glitchColor(numColor));
    setCell(buffer, px + 1, py, ']', glitchColor(bracketColor));

    // Label below
    const portalData = PORTALS.find(p => p.id === portal.id);
    const label = portalData?.name ?? '';
    const labelStart = px - Math.floor(label.length / 2);
    const labelColor = portal.visited ? VERY_DIM : DIM;

    for (let i = 0; i < label.length; i++) {
      setCell(buffer, labelStart + i, py + 1, label[i]!, glitchColor(labelColor));
    }
  }
}

// Build modal content with proper wrapping
interface Modal {
  lines: Cell[][];
  width: number;
  height: number;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line.length + word.length + 1 > maxWidth) {
      if (line) lines.push(line.trimEnd());
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function buildModal(portalId: number, maxWidth: number): Modal {
  const content = getPortalContent(portalId);
  if (!content) return { lines: [], width: 0, height: 0 };

  // Wider modal to fit all text (min 56, max 64)
  const modalWidth = Math.min(64, Math.max(56, maxWidth - 8));
  const innerWidth = modalWidth - 6;  // border + padding on each side

  const textLines: string[] = [];

  // Title
  textLines.push('');
  textLines.push(`  ${content.name}`);
  textLines.push('');

  // Description with proper wrapping
  const descLines = wrapText(content.description, innerWidth - 2);
  for (const line of descLines) {
    textLines.push(`  ${line}`);
  }

  textLines.push('');

  // CLI usage - label and command on same line
  textLines.push(`  CLI: $ ${content.cliUsage}`);

  // MCP usage - label and command on same line
  textLines.push(`  MCP: ${content.mcpUsage}`);

  textLines.push('');

  // Rabbit tip (wrap if needed)
  const tipLines = wrapText(`"${content.rabbitTip}"`, innerWidth - 4);
  textLines.push(`  > ${tipLines[0] || ''}`);
  for (let i = 1; i < tipLines.length; i++) {
    textLines.push(`    ${tipLines[i]}`);
  }

  textLines.push('');
  // Center the close hint
  const closeHint = '[O] Close';
  const closePadding = Math.floor((innerWidth - closeHint.length) / 2);
  textLines.push(' '.repeat(closePadding) + closeHint);
  textLines.push('');

  // Build cell array
  const lines: Cell[][] = [];

  // Top border
  const topBorder: Cell[] = [];
  topBorder.push({ char: '┌', color: DIM });
  for (let i = 0; i < modalWidth - 2; i++) {
    topBorder.push({ char: '─', color: DIM });
  }
  topBorder.push({ char: '┐', color: DIM });
  lines.push(topBorder);

  // Content lines - standardized colors for all modals
  for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
    const text = textLines[lineIdx]!;
    const line: Cell[] = [];
    line.push({ char: '│', color: DIM });

    // Determine line type for consistent coloring
    const isTitle = lineIdx === 1;  // Second line is title
    const isCli = text.trimStart().startsWith('CLI:');
    const isMcp = text.trimStart().startsWith('MCP:');
    const isTip = text.trimStart().startsWith('>');
    const isClose = text.includes('[O]');

    // Find positions for CLI/MCP coloring
    const dollarPos = text.indexOf('$');
    const mcpColonPos = isMcp ? text.indexOf(':') : -1;

    for (let x = 0; x < modalWidth - 2; x++) {
      if (x < text.length) {
        const char = text[x]!;
        let color = WHITE;

        if (isTitle) {
          color = ORANGE;  // Title always orange
        } else if (isCli) {
          // "CLI: " in DIM, "$ command" in ORANGE
          if (dollarPos !== -1 && x >= dollarPos) {
            color = ORANGE;
          } else {
            color = DIM;
          }
        } else if (isMcp) {
          // "MCP: " in DIM, "command" in ORANGE
          if (mcpColonPos !== -1 && x > mcpColonPos + 1) {
            color = ORANGE;
          } else {
            color = DIM;
          }
        } else if (isTip) {
          color = DIM;  // Tips in dim
        } else if (isClose) {
          color = DIM;  // Close hint in dim
        }

        line.push({ char, color: glitchColor(color) });
      } else {
        line.push({ char: ' ', color: '' });
      }
    }

    line.push({ char: '│', color: DIM });
    lines.push(line);
  }

  // Bottom border
  const bottomBorder: Cell[] = [];
  bottomBorder.push({ char: '└', color: DIM });
  for (let i = 0; i < modalWidth - 2; i++) {
    bottomBorder.push({ char: '─', color: DIM });
  }
  bottomBorder.push({ char: '┘', color: DIM });
  lines.push(bottomBorder);

  return { lines, width: modalWidth, height: lines.length };
}

// Render modal to buffer
function renderModal(buffer: Cell[][], modal: Modal, state: GameState): void {
  const modalTop = Math.floor((state.height - modal.height) / 2);
  const modalLeft = Math.floor((state.width - modal.width) / 2);

  for (let my = 0; my < modal.height; my++) {
    const screenY = modalTop + my;
    if (screenY < 0 || screenY >= buffer.length) continue;

    const modalRow = modal.lines[my]!;
    for (let mx = 0; mx < modal.width; mx++) {
      const screenX = modalLeft + mx;
      if (screenX < 0 || screenX >= buffer[0]!.length) continue;

      const cell = modalRow[mx];
      if (cell) {
        buffer[screenY]![screenX] = cell;
      }
    }
  }
}

// Render footer
function renderFooter(buffer: Cell[][], state: GameState): void {
  const y = buffer.length - 1;
  const width = buffer[0]!.length;

  const visited = state.visitedCount;
  const total = PORTALS.length;
  const barWidth = 12;
  const filled = Math.floor((visited / total) * barWidth);

  // Progress bar
  let x = 1;
  for (let i = 0; i < filled; i++) {
    setCell(buffer, x++, y, '█', glitchColor(ORANGE));
  }
  for (let i = filled; i < barWidth; i++) {
    setCell(buffer, x++, y, '░', VERY_DIM);
  }

  // Count
  const countText = ` ${visited}/${total}`;
  for (const c of countText) {
    setCell(buffer, x++, y, c, WHITE);
  }

  // Controls (right aligned)
  const controls = '←↑↓→ Move  q Quit';
  const controlsStart = width - controls.length - 1;
  for (let i = 0; i < controls.length; i++) {
    setCell(buffer, controlsStart + i, y, controls[i]!, DIM);
  }
}

// Convert buffer to string
function bufferToString(buffer: Cell[][]): string {
  let frame = HOME;

  for (let y = 0; y < buffer.length; y++) {
    const row = buffer[y]!;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]!;
      if (cell.char === '') {
        // Skip cells marked as occupied (by wide chars)
        continue;
      }
      if (cell.color) {
        frame += cell.color + cell.char + RESET;
      } else {
        frame += cell.char;
      }
    }
    if (y < buffer.length - 1) {
      frame += '\n';
    }
  }

  return frame;
}

// Enter game screen
export function enterScreen(): void {
  process.stdout.write(ENTER_ALT + HIDE_CURSOR);
}

// Exit game screen
export function exitScreen(): void {
  process.stdout.write(SHOW_CURSOR + EXIT_ALT);
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Typing intro effect
export async function renderIntro(width: number, height: number): Promise<void> {
  const centerY = Math.floor(height / 2) - Math.floor(INTRO_LINES.length / 2);

  // Clear screen first
  let clear = HOME;
  for (let y = 0; y < height; y++) {
    clear += ' '.repeat(width) + '\n';
  }
  process.stdout.write(clear);

  for (let i = 0; i < INTRO_LINES.length; i++) {
    const line = INTRO_LINES[i]!;
    const row = centerY + i;
    const col = Math.floor((width - line.length) / 2);

    if (!line) {
      await sleep(400);
      continue;
    }

    for (let j = 0; j < line.length; j++) {
      process.stdout.write(`${ESC}[${row + 1};${col + j + 1}H${ORANGE}${line[j]}${RESET}`);
      await sleep(50);
    }
    await sleep(500);
  }

  await sleep(800);

  const prompt = '[Press any key]';
  const promptRow = centerY + INTRO_LINES.length + 2;
  const promptCol = Math.floor((width - prompt.length) / 2);
  process.stdout.write(`${ESC}[${promptRow + 1};${promptCol + 1}H${DIM}${prompt}${RESET}`);
}

// Render hint when near a portal
function renderHint(buffer: Cell[][], state: GameState): void {
  if (state.nearPortalId === null || state.showModal) return;

  const portal = state.portals.find(p => p.id === state.nearPortalId);
  if (!portal) return;

  // Show "[O] Open" hint below portal label
  const hint = '[O] Open';
  const hintX = portal.pos.x - Math.floor(hint.length / 2);
  const hintY = portal.pos.y + 3;  // Below portal label

  for (let i = 0; i < hint.length; i++) {
    setCell(buffer, hintX + i, hintY, hint[i]!, glitchColor(ORANGE));
  }
}

// Main render function
export function render(state: GameState): void {
  const { width, height, currentPortalId, showModal } = state;

  // Update glitch state
  updateGlitch();

  // Create screen buffer
  const buffer = createBuffer(width, height);

  // Layer 1: Rain background
  renderRainToBuffer(buffer);

  // Layer 2: Portals
  renderPortals(buffer, state);

  // Layer 3: Hint (if near portal)
  renderHint(buffer, state);

  // Layer 4: Rabbit
  renderRabbit(buffer, state.rabbit.x, state.rabbit.y, state.rabbitLooking);

  // Layer 5: Player (stick figure)
  renderPlayer(buffer, state.player);

  // Layer 6: Modal (if showing)
  if (showModal && currentPortalId) {
    const modal = buildModal(currentPortalId, width);
    renderModal(buffer, modal, state);
  }

  // Layer 7: Footer
  renderFooter(buffer, state);

  // Convert to string and write
  const frame = bufferToString(buffer);
  process.stdout.write(frame);
}

// Finale screen
export function renderFinale(width: number, height: number): void {
  updateGlitch();

  const buffer = createBuffer(width, height);

  // Rain background
  renderRainToBuffer(buffer);

  // Title: "Claude Matrix" centered
  const title = 'Claude Matrix';
  const titleY = Math.floor(height / 2) - 2;
  const titleX = Math.floor((width - title.length) / 2);
  for (let i = 0; i < title.length; i++) {
    setCell(buffer, titleX + i, titleY, title[i]!, glitchColor(ORANGE));
  }

  // Subtitle
  const subtitle = 'use matrix help or matrix follow the white rabbit for help!';
  const subY = titleY + 2;
  const subX = Math.floor((width - subtitle.length) / 2);
  for (let i = 0; i < subtitle.length; i++) {
    setCell(buffer, subX + i, subY, subtitle[i]!, glitchColor(DIM));
  }

  // Credits at bottom
  const credits = 'made by ojowwalker77 and Claude Opus 4.5';
  const creditsY = CONTRIBUTORS.length > 0 ? height - 3 : height - 2;
  const creditsX = Math.floor((width - credits.length) / 2);
  for (let i = 0; i < credits.length; i++) {
    setCell(buffer, creditsX + i, creditsY, credits[i]!, VERY_DIM);
  }

  // Contributors line (only if there are contributors)
  if (CONTRIBUTORS.length > 0) {
    const contribText = `contributors: ${CONTRIBUTORS.join(', ')}`;
    const contribY = height - 2;
    const contribX = Math.floor((width - contribText.length) / 2);
    for (let i = 0; i < contribText.length; i++) {
      setCell(buffer, contribX + i, contribY, contribText[i]!, VERY_DIM);
    }
  }

  const frame = bufferToString(buffer);
  process.stdout.write(frame);
}
