{%- match out_lib_path -%}
  {%- when LibPath::Modules(mods) -%}
    export = CommonJsShim;

    declare namespace CommonJsShim {
      export type LibPathResult = {
        triple: string;
        path: string;
      };

      export function getLibPathModule(): LibPathResult;
    }
  {%- else -%}
    {# Don't render anything otherwise, in the rust code if this file is empty it is not written to disk. #}
{%- endmatch -%}
