# claude-plugins

Plugins for Claude Code.

## Install

Run this at the prompt of a terminal session. Answer `y` to add the marketplace, then pick a scope.

```
/plugin install open-questions --marketplace cunderw/claude-plugins
```

## Plugins

| Plugin | What it does |
| --- | --- |
| [open-questions](plugins/open-questions) | Pins Claude's unanswered questions above the prompt until you reply. |

## Develop

Each plugin is a folder under `plugins/`, listed in `.claude-plugin/marketplace.json`.

```
claude --plugin-dir plugins/<plugin>     # run it from its folder
claude plugin validate plugins/<plugin>  # check the manifest and hooks
claude plugin test plugins/<plugin>      # run its tests
```

A plugin's `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. The engine writes that folder when it loads the plugin, and git ignores it.
