{%- call ts::docstring(enum_def, 0) %}
export type {{ enum_def.name() | typescript_class_name }} =
    {%- for variant in enum_def.variants() %}
    {%- call ts::docstring(variant, 4) %}
    {% if !variant.fields().is_empty() -%}
    | {
    variant: "{{variant.name() | typescript_var_name }}",
    values: {
        {%- for (field_index, field_def) in variant.fields().iter().enumerate() -%}

        {%- call ts::docstring(field_def, 8) %}
        {%- if field_def.name().is_empty() -%}
          {{ field_index }}: {{ field_def | typescript_type_name }}
        {%- else -%}
          {{ field_def.name() | typescript_var_name }}: {{ field_def | typescript_type_name }}
        {%- endif -%}

        {%- if !loop.last %}, {% endif -%}
        {%- endfor %}
    }
    }
    {% else %}
    | "{{variant.name() | typescript_var_name -}}"
    {%- endif %}
    {%- endfor %}

export const {{ enum_def.name() | typescript_ffi_converter_struct_enum_name }} = (() => {
  const ordinalConverter = FfiConverterInt32;
  type TypeName = {{ enum_def.name() | typescript_class_name }};
  class FFIConverter extends AbstractFfiConverterByteArray<TypeName> {
    read(from: RustBuffer): TypeName {
      // FIXME: this does not handle enum variants with associated fields right now!
      switch (ordinalConverter.read(from)) {
        {% for (index, variant) in enum_def.variants().iter().enumerate() -%}
        case {{ index }}:
          return "{{ variant.name() | typescript_var_name }}";
        {% endfor -%}
        default:
          throw new UniffiInternalError.UnexpectedEnumCase();
      }
    }
    write(value: TypeName, into: RustBuffer): void {
      switch (value) {
        {% for (index, variant) in enum_def.variants().iter().enumerate() -%}
        case "{{ variant.name() | typescript_var_name }}":
          return ordinalConverter.write({{ index }}, into);
        {% endfor -%}
      }
    }
    allocationSize(value: TypeName): number {
      return ordinalConverter.allocationSize(0);
    }
  }
  return new FFIConverter();
})();