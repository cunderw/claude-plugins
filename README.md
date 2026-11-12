# claude-plugins

Plugins for Claude Code.

## Install

Run this at the prompt of a terminal session. Answer `y` to add the marketplace, then pick a scope.

```
/plugin install open-questions --marketplace cunderw/claude-plugins
/plugin install inline-images --marketplace cunderw/claude-plugins
```

## Plugins

| Plugin | What it does |
| --- | --- |
| [open-questions](plugins/open-questions) | Pins Claude's unanswered questions above the prompt until you reply. |
| [inline-images](plugins/inline-images) | Shows PNGs Claude reads or sends as pictures under the tool call, in terminals with kitty graphics. |

### inline-images

When Claude reads a `.png` or sends you one, the picture is drawn under that tool call (up to six per call), scaled to the terminal's width. It needs a terminal that speaks the kitty graphics protocol, such as kitty or Ghostty, and uses macOS's `sips` to make a smaller copy to send.

Claude Code only draws pictures when it recognises the terminal. Inside a multiplexer or wrapper that answers as itself, it shows a text line instead. Set this in the `env` block of `~/.claude/settings.json`, or export it, and restart Claude Code:

```
CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
```

## Develop

Each plugin is a folder under `plugins/`, listed in `.claude-plugin/marketplace.json`.

```
claude --plugin-dir plugins/<plugin>     # run it from its folder
claude plugin validate plugins/<plugin>  # check the manifest and hooks
claude plugin test plugins/<plugin>      # run its tests
```

A plugin's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. The engine writes that folder when it loads the plugin, and git ignores it.

## License

MIT. See [LICENSE](LICENSE).
