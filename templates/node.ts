{%- import "macros.rs" as macros -%}

{% macro docstring(optional_docstring) %}
    {%- if let Some(docstring) = optional_docstring -%}
/**
{%- for line in docstring.split("\n") %}
  * {{line}}
{%- endfor %}
  */
    {%- endif -%}
{% endmacro %}

{% macro param_list(func) %}
	{%- for arg in func.arguments() -%}
	    {%- let type_ = arg.as_type() -%}
	    {{ arg.name() | typescript_var_name }}: {{ arg | typescript_type_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}

{% macro napi_call_arg_list(func_def) %}
	{%- for arg in func_def.arguments() -%}
	    {{ arg.name() | typescript_var_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
{%- endmacro %}





import {
  load,
  DataType,
  JsExternal,
  open,
  close,
  arrayConstructor,
  define,
} from 'ffi-rs';

// FIXME: un hard code path and make it platform specific
open({ library: 'lib{{ ci.crate_name() }}', path: "/Users/ryan/w/livekit/rust-sdks/target/release/liblivekit_uniffi.dylib" })

// const r = load({
//     library: "liblivekit_uniffi", // path to the dynamic library file
//     funcName: 'uniffi_livekit_uniffi_checksum_func_build_version', // the name of the function to call
//     retType: DataType.I16, // the return value type
//     paramsType: [], // the parameter types
//     paramsValue: [] // the actual parameter values
//     // freeResultMemory: true, // whether or not need to free the result of return value memory automatically, default is false
// })
// console.log('RESULT:', r);

const r = load({
    library: "liblivekit_uniffi", // path to the dynamic library file
    funcName: 'uniffi_livekit_uniffi_fn_func_generate_token', // the name of the function to call
    retType: arrayConstructor({ type: DataType.U8Array, length: 10 }), // the return value type
    paramsType: [DataType.U8Array, DataType.U8Array], // the parameter types
    paramsValue: [Buffer.alloc(200), Buffer.alloc(200)] // the actual parameter values
    // freeResultMemory: true, // whether or not need to free the result of return value memory automatically, default is false
})
console.log('RESULT:', r);

// Release library memory when you're not using it.
close('liblivekit_uniffi')









// ==========
// Record definitions:
// ==========

{% for record_def in ci.record_definitions() %}
{% call docstring(record_def.docstring()) %}
export type {{ record_def.name() | typescript_class_name }} = {
  {%- for field_def in record_def.fields() -%}
    {% call docstring(field_def.docstring()) %}
    {%- let type_ = field_def.as_type() %}
    {{field_def.name() | typescript_var_name}}: {{field_def | typescript_type_name}};
  {%- endfor %}
}

{#
export const {{ record_def.name() }} = {
  lift(input: Buffer, index = 0): [{{ record_def.name() }}, number] {
    {%- match field.type_().borrow() -%}
        {%- when Type::Int8 | Type::Int16 | Type::Int32 | Type::Int64 | Type::UInt8 | Type::UInt16 | Type::UInt32 | Type::UInt64 | Type::Float32 | Type::Float64 -%}
            self.{{ field.name() }}.get_u64().1
        {%- when FfiType::Int64 -%}
            self.{{ field.name() }}.get_i64().0
        {%- when FfiType::Struct(_) -%}
            self.{{ field.name() }}.to_c_struct()
        {%- when FfiType::RustBuffer(_) -%}
            {
                // FIXME: this is untested, check this to make sure it works once it gets generated
                // in final output
                let slice_u8 = self.{{ field.name() }}.as_ref();
                let vec_u8 = slice_u8.to_vec();
                RustBuffer::from_vec(vec_u8)
            }
        {%- when FfiType::RustCallStatus -%}
            decode_uintarray_to_rust_call_status(&self.{{ field.name() }})
        {%- else -%}
            self.{{ field.name() }} /* FIXME: add more field handlers here! */
    {%- endmatch -%}

    index += 
    {%- for field_def in record_def.fields() -%}
        {% call docstring(field_def.docstring()) %}
        {%- let type_ = field_def.as_type() %}
        {{field_def.name() | typescript_var_name}}: {{field_def | typescript_type_name}};
    {%- endfor %}
  },
  lower(input: {{ record_def.name() }}): Buffer {
    // TODO!
  },
};
#}

{% endfor %}

// ==========
// Enum definitions:
// ==========

{% for enum_def in ci.enum_definitions() %}
{% call docstring(enum_def.docstring()) %}
export type {{ enum_def.name() | typescript_class_name }} =
{%- for variant in enum_def.variants() %}
    {% call docstring(variant.docstring()) %}

    {%- if !variant.fields().is_empty() -%}
    | {
      variant: "{{variant.name() | typescript_var_name }}",
      values: {
        {%- for field_def in variant.fields() -%}
          {%- let type_ = field_def.as_type() %}
          {{field_def.name() | typescript_var_name}}: {{field_def | typescript_type_name}}
          {%- if !loop.last %}, {% endif -%}
        {%- endfor %}
      }
    }
    {%- else -%}
    | "{{variant.name() | typescript_var_name -}}"
    {%- endif -%}
{%- endfor %}

{% endfor %}

// ==========
// Object definitions:
// ==========


// ==========
// Function definitions:
// ==========

{% for func_def in ci.function_definitions() %}
{% call docstring(func_def.docstring()) %}
export {% if func_def.is_async() %}async {% endif %}function {{ func_def.name() | typescript_fn_name }}(
  {%- call param_list(func_def) -%}
){%- if let Some(ret_type) = func_def.return_type() -%}: {% if func_def.is_async() -%}
  Promise<{%- endif -%}{{ ret_type | typescript_type_name }}{%- if func_def.is_async() -%}>{%- endif -%}
{%- endif %} {
    return FFI_DYNAMIC_LIB.{{ func_def.ffi_func().name() }}([{% call napi_call_arg_list(func_def) %}]);
}

{% endfor %}


// ==========
// FFI Layer
// ==========

// Struct + Callback type definitions
{%- for definition in ci.ffi_definitions() -%}
  {%- match definition %}
    {%- when FfiDefinition::CallbackFunction(callback) %}
    export type {{ callback.name() | typescript_callback_name }} = (
      {%- for arg in callback.arguments() %}
        {{ arg.name() }}: {{ arg.type_().borrow() | typescript_ffi_type_name }}{% if !loop.last %}, {% endif %}
      {%- endfor %}
      {%-   if callback.has_rust_call_status_arg() -%}
      {%      if callback.arguments().len() > 0 %}, {% endif %}{{ &FfiType::RustCallStatus | typescript_ffi_type_name }}
      {%-   endif %}
    ) => {% match callback.return_type() %}
    {%-   when Some(return_type) -%}
      {{- return_type | typescript_ffi_type_name -}}
    {%-   when None -%}
      void
    {%- endmatch %};

    {%- when FfiDefinition::Struct(struct_data) -%}
    export type {{ struct_data.name() | typescript_ffi_struct_name }} = {
      {%- for field_def in struct_data.fields() -%}
          {{field_def.name() | typescript_var_name}}: {{field_def.type_().borrow() | typescript_ffi_type_name}};
      {%- endfor %}
    };
    {%- else -%}
  {%- endmatch %}
{%- endfor %}

// Actual FFI functions from dynamic library
/** This direct / "extern C" type FFI interface is bound directly to the functions exposed by the
  * dynamic library. Using this manually from end-user javascript code is unsafe and this is not
  * recommended. */
const FFI_DYNAMIC_LIB = define({
    {%- for definition in ci.ffi_definitions() %}
        {%- match definition %}

        {%- when FfiDefinition::CallbackFunction(callback) %}
        {{ callback.name() }}: {
          library: "lib{{ ci.crate_name() }}",
          retType: {%- match callback.return_type() %}
          {%-   when Some(return_type) %}
            {{- return_type | typescript_ffi_datatype_name -}}
          {%-   when None %}
            DataType.Void
          {%- endmatch %},
          paramsType: [
            {%- for arg in callback.arguments() %}
              {{ arg.type_().borrow() | typescript_ffi_datatype_name }}{% if !loop.last %}, {% endif %}
            {%- endfor %}
            {%-   if callback.has_rust_call_status_arg() -%}
            {%      if callback.arguments().len() > 0 %}, {% endif %}{{ &FfiType::RustCallStatus | typescript_ffi_datatype_name }}
            {%-   endif %}
          ],
        },

        {%- when FfiDefinition::Function(func) %}
        {{ func.name() }}: {
          library: "lib{{ ci.crate_name() }}",
          retType: {%- match func.return_type() %}
          {%-   when Some(return_type) %}
            {{- return_type | typescript_ffi_datatype_name -}}
          {%-   when None %}
            DataType.Void
          {%- endmatch %},
          paramsType: [
            {%- for arg in func.arguments() %}
              {{ arg.type_().borrow() | typescript_ffi_datatype_name }}{% if !loop.last %}, {% endif %}
            {%- endfor %}
            {%-   if func.has_rust_call_status_arg() -%}
            {%      if func.arguments().len() > 0 %}, {% endif %}/* rustCallStatus */ DataType.External
            {%-   endif %}
          ],
        },

        {%- else %}
        {%- endmatch %}

    {%- endfor %}
}) as {
  {%- for definition in ci.ffi_definitions() %}
      {%- match definition %}

      {%- when FfiDefinition::CallbackFunction(callback) %}
      {{ callback.name() }}: (args: [
        {%- for arg in callback.arguments() %}
          /* {{ arg.name() }} */ {{ arg.type_().borrow() | typescript_ffi_type_name }}{% if !loop.last %}, {% endif %}
        {%- endfor %}
        {%-   if callback.has_rust_call_status_arg() -%}
        {%      if callback.arguments().len() > 0 %}, {% endif %} RustCallStatus
        {%-   endif %}
      ]) => {%- match callback.return_type() %}
      {%-   when Some(return_type) %}
        {{- return_type | typescript_ffi_type_name -}}
      {%-   when None %}
        void
      {%- endmatch %},

      {%- when FfiDefinition::Function(func) %}
      {{ func.name() }}: (args: [
        {%- for arg in func.arguments() %}
          /* {{ arg.name() }} */ {{ arg.type_().borrow() | typescript_ffi_type_name }}{% if !loop.last %}, {% endif %}
        {%- endfor %}
        {%-   if func.has_rust_call_status_arg() -%}
        {%      if func.arguments().len() > 0 %}, {% endif %}{{ &FfiType::RustCallStatus | typescript_ffi_type_name }}
        {%-   endif %}
      ]) => {%- match func.return_type() %}
      {%-   when Some(return_type) %}
        {{- return_type | typescript_ffi_type_name -}}
      {%-   when None %}
        void
      {%- endmatch %},

      {%- else %}
      {%- endmatch %}

  {%- endfor %}
};
