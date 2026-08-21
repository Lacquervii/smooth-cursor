/** `settings.cursor-effect` namespace dictionaries (the Input caret row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'cursor.title': '输入光标',
  'cursor.titleDescription': '聊天输入框的文字光标',
  'cursor.enabled': '呼吸光标',
  'cursor.trail': '彗星拖尾',
  'cursor.trailDescription': '移动时在光标后带出一串渐隐尾迹',
  'cursor.color': '颜色',
  'cursor.customColor': '自定义颜色',
  'cursor.thickness': '粗细',
  'cursor.size.small': '细',
  'cursor.size.medium': '中',
  'cursor.size.large': '粗',
} satisfies Record<string, string>

/** The settings.cursor-effect namespace key union. */
export type CursorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'cursor.title': 'Input caret',
  'cursor.titleDescription': 'Animated caret for the chat input',
  'cursor.enabled': 'Breathing caret',
  'cursor.trail': 'Comet trail',
  'cursor.trailDescription': 'Trails a fading tail behind the caret as it moves',
  'cursor.color': 'Color',
  'cursor.customColor': 'Custom color',
  'cursor.thickness': 'Thickness',
  'cursor.size.small': 'Thin',
  'cursor.size.medium': 'Medium',
  'cursor.size.large': 'Thick',
} satisfies Record<CursorKey, string>
