// Dialog and portal content for the rabbit hole onboarding game

export interface PortalContent {
  id: number;
  name: string;
  icon: string;
  title: string;
  description: string;
  cliUsage: string;
  mcpUsage: string;
  rabbitTip: string;
}

export const PORTALS: PortalContent[] = [
  {
    id: 1,
    name: 'SEARCH',
    icon: '',
    title: 'Semantic Search',
    description: 'Find past solutions using natural language. Describe your problem and Matrix finds relevant solutions even with different wording.',
    cliUsage: 'matrix search "how to handle OAuth refresh"',
    mcpUsage: 'matrix_recall (Claude calls this automatically)',
    rabbitTip: 'Stuck? Search first.',
  },
  {
    id: 2,
    name: 'STORE',
    icon: '',
    title: 'Save Solutions',
    description: 'Store successful solutions with tags and scope. Global solutions work everywhere, stack solutions for similar tech, repo for this project only.',
    cliUsage: 'matrix store (interactive) or via MCP',
    mcpUsage: 'matrix_store({ problem, solution, scope, tags })',
    rabbitTip: 'Store it. Future you says thanks.',
  },
  {
    id: 3,
    name: 'RECALL',
    icon: '',
    title: 'Auto-Recall',
    description: 'Claude automatically searches Matrix when you start a task. Past solutions surface when relevant - you focus on coding, not remembering.',
    cliUsage: 'Happens automatically via Claude',
    mcpUsage: 'matrix_recall({ query, limit, minScore })',
    rabbitTip: 'Matrix remembers. You code.',
  },
  {
    id: 4,
    name: 'REWARD',
    icon: '',
    title: 'Feedback Loop',
    description: 'Rate recalled solutions after using them. Success boosts ranking, failure demotes. Matrix learns what actually works for you.',
    cliUsage: 'matrix reward <id> success|partial|failure',
    mcpUsage: 'matrix_reward({ solutionId, outcome, notes })',
    rabbitTip: 'Teach Matrix what works.',
  },
  {
    id: 5,
    name: 'FAILURE',
    icon: '',
    title: 'Error Memory',
    description: 'Record errors and their fixes. Next time you hit the same error, Matrix surfaces the fix. Turn debugging pain into future gains.',
    cliUsage: 'matrix failure (interactive)',
    mcpUsage: 'matrix_failure({ error, fix, prevention })',
    rabbitTip: 'Same bug twice? Never again.',
  },
  {
    id: 6,
    name: 'STATS',
    icon: '',
    title: 'Statistics',
    description: 'Overview of your memory: solution count, success rates, top tags, recent activity. Track your knowledge growth over time.',
    cliUsage: 'matrix stats',
    mcpUsage: 'matrix_status()',
    rabbitTip: 'Track your growth.',
  },
];

export const INTRO_LINES = [
  'Wake up, Neo...',
  '',
  'The Matrix has you.',
  '',
  'Follow the white rabbit.',
];

// Glitch variant - "Matrix" becomes "Claude"
export const INTRO_LINES_GLITCH = [
  'Wake up, Neo...',
  '',
  'The Claude has you.',
  '',
  'Follow the white rabbit.',
];

export const FINALE_LINES = [
  'You\'ve seen everything.',
  '',
  'The Matrix remembers so you don\'t have to.',
  '',
  'Welcome to the real world.',
];

// Characters
export const CHARS = {
  portalUnvisited: '◻',
  portalVisited: '◼',
};

// Rabbit ASCII art - multi-line for better look
// Each entry is [line0, line1, line2] from top to bottom
export const RABBIT_ART = {
  right: [
    ' (\\(\\ ',
    ' ( -.-)>',
    'o_(")(") ',
  ],
  left: [
    '  /)/)',
    '<(.-. )',
    ' (")(")_o',
  ],
};

// Stick figure player - multi-line ASCII art
// [head, torso, legs]
export type PlayerDirection = 'idle' | 'up' | 'down' | 'left' | 'right';

export const STICK_FIGURES: Record<PlayerDirection, string[]> = {
  idle: [
    ' o ',
    '/|\\',
    '/ \\',
  ],
  up: [
    '\\o/',
    ' | ',
    '/ \\',
  ],
  down: [
    ' o ',
    '/|\\',
    '/ \\',
  ],
  left: [
    ' o ',
    '/|>',
    '/ \\',
  ],
  right: [
    ' o ',
    '<|\\',
    '/ \\',
  ],
};

// Katakana for Matrix rain effect (half-width)
export const KATAKANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

// Auto-generated contributors - do not edit manually
export const CONTRIBUTORS: string[] = ["CairoAC"];
