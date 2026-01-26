{%- match out_lib_path -%}
  {%- when LibPath::Modules(mods) -%}
    export type LibPathResult = {
      triple: string;
      path: string;
    };

    // This function exists so calls can be made to require in a common js context and
    // the results bridged back into the main esm context
    module.exports.getLibPathModule = function getLibPathModule(): LibPathResult {
      let libPathModule;
      let libPathModuleLastResolutionError: Error | null = null;
      let libPathModuleLoadAttemptStack: Array<string> = [];

      {%- for switch_token in mods.as_switch_tokens() -%}
        {% match switch_token -%}
        {% when LibPathSwitchToken::Switch(value) -%}
          switch ({{ value }}) {
        {% when LibPathSwitchToken::Case(value) -%}
          case "{{value}}":
        {% when LibPathSwitchToken::EndCase -%}
          break;
        {% when LibPathSwitchToken::EndSwitch(_value) -%}
          }
        {% when LibPathSwitchToken::Value(value) -%}
            if (!libPathModule) {
              try {
                libPathModule = require("{{ value }}");
              } catch (e) {
                libPathModuleLastResolutionError = e;
                libPathModuleLoadAttemptStack.push("{{ value }}");
              }
            }
        {%- endmatch -%}
      {%- endfor -%}

      if (!libPathModule) {
        throw new Error(`Failed to load a native binding library! Attempted loading from the following modules in order: ${libPathModuleLoadAttemptStack.join(", ")}. The error message from the final error is ${libPathModuleLastResolutionError}`);
      }

      return libPathModule.default();
    }
  {%- else -%}
    {# Don't render anything otherwise, in the rust code if this file is empty it is not written to disk. #}
{%- endmatch -%}

