{# TODO: doc comments for variant fields #}
{%- macro variant_inner_fields(variant) %}Readonly<
{%-   if !variant.has_nameless_fields() %}{
{%-     for field in variant.fields() %}
{{-       field.name() | typescript_var_name }}: {{ field | typescript_type_name }}
{%-       if !loop.last %}; {% endif -%}
{%-     endfor %}}
{%-   else %}[
{%-     for field in variant.fields() %}
{{-       field | typescript_type_name }}
{%-       if !loop.last %}, {% endif -%}
{%-     endfor %}]
{%-   endif %}>
{%- endmacro %}

{%- call ts::docstring(enum_def, 0) %}
export type {{ enum_def.name() | typescript_class_name }} =
    {%- for variant in enum_def.variants() %}
    {%- let variant_name = variant.name() | typescript_var_name %}
    {%- call ts::docstring(variant, 4) %}
    {% if enum_def.is_flat() -%}
    | "{{ variant_name }}"
    {%- else -%}
    | {
        type: "{{ variant_name }}",
        {%- if !variant.fields().is_empty() %}
        inner: {% call variant_inner_fields(variant) %}
        {%- endif %}
    }
    {%- endif -%}
    {%- endfor %}


export const {{ enum_def.name() | typescript_ffi_converter_struct_enum_object_name }} = (() => {
    {%- let converter = "FfiConverterInt32" %}
    {%- let type_name = enum_def.name() | typescript_class_name %}
    class FFIConverter extends AbstractFfiConverterByteArray<{{ type_name }}> {
        read(from: RustBuffer): {{ type_name }} {
            switch ({{ converter }}.read(from)) {
                {%- for variant in enum_def.variants() %}
                {%- let variant_name = variant.name() | typescript_var_name %}
                case {{ loop.index0 + 1 }}: return "{{ variant_name }}";
                {%- endfor %}
                default: throw new UniffiInternalError.UnexpectedEnumCase();
            }
        }
        write(value: {{ type_name }}, into: RustBuffer): void {
            switch (value) {
                {%- for variant in enum_def.variants() %}
                {%- let variant_name = variant.name() | typescript_var_name %}
                case "{{ variant_name }}": {{ converter }}.write({{ loop.index0 + 1 }}, into);
                {%- endfor %}
                default: throw new UniffiInternalError.UnexpectedEnumCase();
            }
        }
        allocationSize(value: {{ type_name }}): number {
            return {{ converter }}.allocationSize(0);
        }
    }
    return new FFIConverter();
})();