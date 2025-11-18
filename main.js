const { Plugin, PluginSettingTab, MarkdownView, TFile, Notice, Setting } = require('obsidian');

const HeadingCorrector = class {
    constructor() {
        this.numberFormats = {
            'none': () => '',
            'decimal': (n) => n.toString(),
            'chinese': (n) => this.toChineseNumber(n),
            'lower-alpha': (n) => this.numberToAlpha(n).toLowerCase(),
            'upper-alpha': (n) => this.numberToAlpha(n).toUpperCase(),
            'lower-roman': (n) => this.toRoman(n).toLowerCase(),
            'upper-roman': (n) => this.toRoman(n).toUpperCase(),
            'circle': (n) => this.toCircleNumber(n),
            'decimal-paren': (n) => `（${n}）`,
            'decimal-paren-half': (n) => `(${n})`,
            'chinese-paren': (n) => `（${this.toChineseNumber(n)}）`,
            'lower-alpha-paren': (n) => `（${this.numberToAlpha(n).toLowerCase()}）`,
            'upper-alpha-paren': (n) => `（${this.numberToAlpha(n).toUpperCase()}）`,
            'lower-roman-paren': (n) => `（${this.toRoman(n).toLowerCase()}）`,
            'upper-roman-paren': (n) => `（${this.toRoman(n).toUpperCase()}）`,
            'decimal-brace': (n) => `{${n}}`,
            'chapter-chinese': (n) => `第${this.toChineseNumber(n)}章`,
            'section-chinese': (n) => `第${this.toChineseNumber(n)}节`,
            'subsection-chinese': (n) => `第${this.toChineseNumber(n)}条`,
        };
    }

    correctHeadings(text, settings) {
        const lines = text.split('\n');
        const counters = [0, 0, 0, 0, 0, 0];
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (this.isHeadingLine(line)) {
                const heading = this.parseHeading(line);
                if (heading) {
                    const { level, prefix, text: headingText, suffix, originalNumber } = heading;
                    this.updateCounters(counters, level);
                    const formattedNumber = this.generateFormattedNumber(counters, level, settings);
                    const newTitle = this.rebuildHeading(level, prefix, headingText, suffix, formattedNumber, originalNumber, settings);
                    result.push(newTitle);
                    continue;
                }
            }
            result.push(line);
        }
        return result.join('\n');
    }

    isHeadingLine(line) { 
        return /^#{1,6}\s/.test(line); 
    }

    parseHeading(line) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (!match) return null;
        const hashes = match[1], content = match[2], level = hashes.length;

        let prefix = '', text = '', suffix = '', i = 0, len = content.length;

        while (i < len) {
            if (i + 1 < len && (content[i] === '*' || content[i] === '_') && content[i] === content[i+1]) {
                prefix += content[i] + content[i+1]; i += 2; continue;
            }
            if (content[i] === '`') { prefix += '`'; i++; continue; }
            const tagMatch = content.slice(i).match(/^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/);
            if (tagMatch) { prefix += tagMatch[0]; i += tagMatch[0].length; continue; }
            break;
        }

        let j = len - 1;
        while (j >= i) {
            if (j - 1 >= i && (content[j] === '*' || content[j] === '_') && content[j] === content[j-1]) {
                suffix = content[j-1] + content[j] + suffix; j -= 2; continue;
            }
            if (content[j] === '`') { suffix = '`' + suffix; j--; continue; }
            const endTagMatch = content.slice(0, j+1).match(/<\/([a-zA-Z][a-zA-Z0-9]*)>$/);
            if (endTagMatch) { suffix = endTagMatch[0] + suffix; j -= endTagMatch[0].length; continue; }
            break;
        }

        text = content.slice(i, j + 1).trim();
        const { cleanText, strippedNumber } = this.stripExistingNumber(text);
        
        return { 
            level, 
            prefix, 
            text: cleanText, 
            suffix,
            originalNumber: strippedNumber
        };
    }

    stripExistingNumber(text) {
        const punctuation = '[\\s、.,。，．）)]';
        const patterns = [
            new RegExp(`^第[零一二三四五六七八九十百千]+[章节条款目]${punctuation}*`, 'u'),
            new RegExp(`^([零一二三四五六七八九十百千]+|\\d+|[ivxIVX]+|[a-zA-Z]+|[①-⑳❶-❿➀-➓])${punctuation}+`, 'u'),
            /^\(\d+\)\s*/,
            /^（\d+）\s*/,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const clean = text.slice(match[0].length).trim();
                return { cleanText: clean, strippedNumber: match[0] };
            }
        }
        return { cleanText: text, strippedNumber: null };
    }

    updateCounters(c, l) {
        for (let i = l; i < c.length; i++) c[i] = 0;
        c[l-1]++;
    }

    generateFormattedNumber(counters, level, settings) {
        const currentLevelKey = `level${level}`;
        const currentCfg = settings[currentLevelKey];
        if (currentCfg?.format === 'none') {
            return '';
        }

        const onlyLast = settings.onlyLastLevel;
        let parts = [];

        for (let i = 0; i < level; i++) {
            const key = `level${i+1}`;
            const cfg = settings[key];
            if (cfg && cfg.format !== 'none' && this.numberFormats[cfg.format]) {
                parts.push(this.numberFormats[cfg.format](counters[i]));
            }
        }

        if (!parts.length) return '';

        const fmt = settings[`level${level}`]?.format || '';
        const isChapter = /chapter|section|subsection/.test(fmt);
        const num = onlyLast && (parts.length > 1 || isChapter) ? parts[parts.length-1] : parts.join('.');
        return num;
    }

    rebuildHeading(level, prefix, text, suffix, num, originalNumber, settings) {
        let line = '#'.repeat(level) + ' ';
        const separator = settings?.[`level${level}`]?.separator || '';

        if (num === '') {
            const { cleanText } = this.stripExistingNumber(text);
            line += prefix + cleanText + suffix;
        } else {
            if (originalNumber !== null) {
                text = num + separator + text;
                line += prefix + text + suffix;
            } else {
                line += prefix + num + separator + text + suffix;
            }
        }

        return line;
    }

    toChineseNumber(n) {
        if (n <= 0) return '零';
        if (n > 9999) return n.toString();
        const nMap = ['零','一','二','三','四','五','六','七','八','九'];
        const parts = [];
        const wan = Math.floor(n/10000), rest = n%10000;
        const qian = Math.floor(rest/1000), bai = Math.floor(rest%1000/100);
        const shi = Math.floor(rest%100/10), ge = rest%10;

        if (wan) { 
            parts.push(nMap[wan]+'万'); 
            if (qian===0 && (bai||shi||ge)) parts.push('零'); 
        }
        if (qian) { 
            parts.push(nMap[qian]+'千'); 
            if (bai===0 && (shi||ge)) parts.push('零'); 
        }
        if (bai) { 
            parts.push(nMap[bai]+'百'); 
            if (shi===0 && ge) parts.push('零'); 
        }
        if (shi) { 
            parts.push((shi===1 && !wan && !qian && !bai) ? '十' : nMap[shi]+'十'); 
        }
        if (ge && !(shi===1 && !wan && !qian && !bai && ge)) parts.push(nMap[ge]);
        
        return parts.join('').replace(/零+/g,'零').replace(/零$/,'') || '零';
    }

    numberToAlpha(num) {
        let s = '';
        while (num > 0) {
            num--;
            s = String.fromCharCode(65 + (num % 26)) + s;
            num = Math.floor(num / 26);
        }
        return s || 'A';
    }

    toRoman(num) {
        if (num < 1 || num > 3999) return num.toString();
        const t = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
        let r = '';
        for (let [v,s] of t) while (num >= v) { r += s; num -= v; }
        return r;
    }

    toCircleNumber(n) {
        const c = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
        return n >= 1 && n <= 20 ? c[n-1] : `(${n})`;
    }
};

module.exports = class HeadingNumberer extends Plugin {
    async onload() {
        this.corrector = new HeadingCorrector();
        await this.loadSettings();

        this.styleEl = document.createElement('style');
        this.styleEl.textContent = `
            .HN-empty-sep {
                color: var(--text-faint) !important;
                font-style: italic;
            }
        `;
        document.head.appendChild(this.styleEl);

        this.addCommand({
            id: 'correct-headings-preview',
            name: '✔️ Correct Headings (Preview)',
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'h' }],
            callback: () => this.correctCurrentFile()
        });

        this.addCommand({
            id: 'correct-headings-replace',
            name: '✅ Correct & Replace in Current File',
            callback: () => this.correctAndReplaceCurrentFile()
        });

        this.addCommand({
            id: 'remove-heading-numbers',
            name: '🧹 Remove All Heading Numbers',
            callback: () => this.removeAllNumbers()
        });

        this.addRibbonIcon('hash', 'Correct Headings', () => this.correctCurrentFile());
        
        const statusBarItem = this.addStatusBarItem();
        statusBarItem.setText('HN');
        statusBarItem.onClickEvent(() => this.correctCurrentFile());

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem(item => 
                        item.setTitle('🔢 Correct Headings')
                            .setIcon('hash')
                            .onClick(() => this.correctFile(file))
                    );
                }
            })
        );

        this.addSettingTab(new HeadingNumbererSettingTab(this.app, this));
    }

    onunload() {
        if (this.styleEl?.parentNode) this.styleEl.parentNode.removeChild(this.styleEl);
    }

    async loadSettings() {
        this.settings = Object.assign(this.getDefaultSettings(), await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    loadDefaultSettings() {
        this.settings = this.getDefaultSettings();
    }

    getDefaultSettings() {
        return {
            onlyLastLevel: false,
            level1: { format: 'chapter-chinese', separator: '' },
            level2: { format: 'section-chinese', separator: '、' },
            level3: { format: 'decimal-paren', separator: ' ' },
            level4: { format: 'none', separator: '' },
            level5: { format: 'none', separator: '' },
            level6: { format: 'none', separator: '' }
        };
    }

    async correctCurrentFile() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) { new Notice('⚠️ No active Markdown file'); return; }
        try {
            const content = await this.app.vault.read(view.file);
            const corrected = this.corrector.correctHeadings(content, this.settings);
            const preview = corrected.split('\n')
                .filter(l => /^#{1,6}\s/.test(l))
                .slice(0, 3)
                .map(l => l.replace(/^#+\s*/, '→ '))
                .join('\n');
            new Notice(`✅ Headings corrected!\n${preview || '(no headings found)'}`, 6000);
        } catch (e) { 
            console.error('HeadingNumberer error:', e);
            new Notice(`❌ Error: ${e.message}`); 
        }
    }

    async correctAndReplaceCurrentFile() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!editor) { new Notice('⚠️ No editor found'); return; }
        try {
            const content = editor.getValue();
            const corrected = this.corrector.correctHeadings(content, this.settings);
            editor.setValue(corrected);
            new Notice('✅ Replaced in current file');
        } catch (e) { 
            console.error('Replace error:', e);
            new Notice(`❌ Replace error: ${e.message}`); 
        }
    }

    async correctFile(file) {
        try {
            const content = await this.app.vault.read(file);
            const corrected = this.corrector.correctHeadings(content, this.settings);
            await this.app.vault.modify(file, corrected);
            new Notice(`✅ Corrected: ${file.name}`);
        } catch (e) { 
            console.error('File correction error:', e);
            new Notice(`❌ Error on ${file.name}: ${e.message}`); 
        }
    }

    async removeAllNumbers() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!editor) { new Notice('⚠️ No editor found'); return; }
        try {
            const noNum = {
                onlyLastLevel: false,
                level1: { format: 'none', separator: '' },
                level2: { format: 'none', separator: '' },
                level3: { format: 'none', separator: '' },
                level4: { format: 'none', separator: '' },
                level5: { format: 'none', separator: '' },
                level6: { format: 'none', separator: '' }
            };
            const content = editor.getValue();
            const cleaned = this.corrector.correctHeadings(content, noNum);
            editor.setValue(cleaned);
            new Notice('✅ All heading numbers removed');
        } catch (e) { 
            console.error('Remove numbers error:', e);
            new Notice(`❌ Removal error: ${e.message}`); 
        }
    }
};

class HeadingNumbererSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Heading Numberer' });

        new Setting(containerEl)
            .setName('📌 Only Last Level Number')
            .setDesc('e.g., "### 第一章.第一条.第一款" → "### 第一款"')
            .addToggle(toggle => 
                toggle.setValue(this.plugin.settings.onlyLastLevel)
                    .onChange(async (value) => {
                        this.plugin.settings.onlyLastLevel = value;
                        await this.plugin.saveSettings();
                    })
            );

        const options = [
            { value: 'none', label: '(None)', group: 'None' },
            { value: 'decimal', label: '1, 2, 3', group: 'Basic' },
            { value: 'chinese', label: '一、二、三', group: 'Basic' },
            { value: 'lower-alpha', label: 'a, b, c', group: 'Basic' },
            { value: 'upper-alpha', label: 'A, B, C', group: 'Basic' },
            { value: 'lower-roman', label: 'i, ii, iii', group: 'Basic' },
            { value: 'upper-roman', label: 'I, II, III', group: 'Basic' },
            { value: 'circle', label: '①, ②, ③', group: 'Basic' },
            { value: 'decimal-paren', label: '（1）,（2）', group: 'Parentheses' },
            { value: 'decimal-paren-half', label: '(1), (2)', group: 'Parentheses' },
            { value: 'chinese-paren', label: '（一）,（二）', group: 'Parentheses' },
            { value: 'chapter-chinese', label: '第一章, 第二章', group: 'Legal/GB' },
            { value: 'section-chinese', label: '第一节, 第二节', group: 'Legal/GB' },
            { value: 'subsection-chinese', label: '第一条, 第二条', group: 'Legal/GB' },
        ];

        const groupedOptions = [];
        let lastGroup = '';
        options.forEach(opt => {
            if (opt.group !== lastGroup && opt.group !== 'None') {
                groupedOptions.push({
                    value: `__GROUP__${opt.group}`,
                    label: `── ${opt.group} ──`,
                    isDisabled: true
                });
                lastGroup = opt.group;
            }
            groupedOptions.push(opt);
        });

        for (let level = 1; level <= 6; level++) {
            const key = `level${level}`;
            new Setting(containerEl)
                .setName(`H${level} Format`)
                .addDropdown(dropdown => {
                    groupedOptions.forEach(opt => {
                        dropdown.addOption(opt.value, opt.label);
                        if (opt.isDisabled) {
                            const el = dropdown.selectEl.querySelector(`option[value="${opt.value}"]`);
                            if (el) el.disabled = true;
                        }
                    });

                    dropdown.setValue(this.plugin.settings[key].format)
                        .onChange(async (value) => {
                            if (value.startsWith('__GROUP__')) return;
                            this.plugin.settings[key].format = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addText(text => {
                    const displayVal = this.plugin.settings[key].separator === '' ? '∅' : this.plugin.settings[key].separator;
                    text.setValue(displayVal);

                    const update = (raw) => {
                        // ✅ FIXED: Preserve spaces; only clear ∅, null, or empty
                        let val = raw;
                        if (val === '∅' || val === 'null' || val === '') {
                            val = '';
                        }
                        this.plugin.settings[key].separator = val;
                        this.plugin.saveSettings();

                        if (val === '') {
                            text.setValue('∅');
                            text.inputEl.classList.add('HN-empty-sep');
                        } else {
                            text.setValue(val);
                            text.inputEl.classList.remove('HN-empty-sep');
                        }
                    };

                    text.onChange(update);

                    const onFocus = () => {
                        if (text.inputEl.value === '∅') {
                            text.inputEl.value = '';
                            text.inputEl.classList.remove('HN-empty-sep');
                        }
                        text.inputEl.removeEventListener('focus', onFocus);
                    };
                    text.inputEl.addEventListener('focus', onFocus);
                })
                .setDesc('Separator after number (e.g., "、", ".", " ", or ∅ for none)');
        }

        new Setting(containerEl)
            .setName('🔄 Reset to Defaults')
            .setDesc('H2 uses "、" for Chinese style')
            .addButton(button => 
                button
                    .setButtonText('Reset')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.loadDefaultSettings();
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice('✅ Reset: H2 separator = "、"');
                    })
            );
    }
}
