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

function rustBufferToUint8Array(buf: UniffiRustBuffer): Uint8Array {
  const [contents] = restorePointer({
    retType: [arrayConstructor({ type: DataType.U8Array, length: buf.len })],
    paramsValue: wrapPointer([buf.data]),
  });

  // const contents = r.uniffi_free_rust_buffer([result]);
  return new Uint8Array(contents);
}

function uint8ArrayToRustBuffer(array: Uint8Array): UniffiRustBuffer {
  const result = FFI_DYNAMIC_LIB.uniffi_new_rust_buffer([Buffer.from(array)]);
  console.log('CREATE RUST BUFFER FOR:', array, '=>', result);
  return result;
}





import {
  type UniffiByteArray,
  type UniffiDuration,
  AbstractFfiConverterByteArray,
  FfiConverterArray,
  FfiConverterBool,
  FfiConverterDuration,
  FfiConverterInt32,
  FfiConverterMap,
  FfiConverterOptional,
  FfiConverterUInt32,
  FfiConverterUInt64,
  RustBuffer,
  UniffiError,
  UniffiInternalError,
  UniffiRustCaller,
  uniffiCreateFfiConverterString,
  uniffiCreateRecord,
  uniffiRustCallAsync,
  uniffiTypeNameSymbol,
  variantOrdinalSymbol,
} from 'uniffi-bindgen-react-native';

// Get converters from the other files, if any.
const uniffiCaller = new UniffiRustCaller(
  () => {
    // const callStatus = FFI_DYNAMIC_LIB.uniffi_new_call_status([]);
    const rustCallStatus = {
      get code(): number {
        const code = FFI_DYNAMIC_LIB.uniffi_get_call_status_code([]);
        console.log('GET CODE:', code);
        return code;
      },

      // get errorBuf(): Uint8Array | undefined {
      get errorBuf(): UniffiRustBuffer | undefined {
        // console.log('GET ERROR BUF LENGTH START:');
        // const byteLength = FFI_DYNAMIC_LIB.uniffi_get_call_status_error_buf_byte_len([]);
        // console.log('GET ERROR BUF LENGTH END:', byteLength);
        // if (byteLength === 0) {
        //   return undefined;
        // }

        // console.log('GET ERROR BUF START:');
        // const rawData = load({
        //   library: 'lib{{ ci.crate_name() }}',
        //   funcName: 'uniffi_get_call_status_error_buf', // the name of the function to call
        //   retType: arrayConstructor({ type: DataType.U8Array, length: byteLength }),
        //   paramsType: [],
        //   paramsValue: [],
        // }) as Array<number>;
        // console.log('GET ERROR BUF END:', rawData);

        const rawData = FFI_DYNAMIC_LIB.uniffi_get_call_status_error_buf([]);
        console.log('RAW DATA:', rawData);

        return rawData;//new Uint8Array(rawData);
      },
      set errorBuf(_value: Uint8Array | null | undefined) {
        throw new Error('errorBuf set not yet implemented!');
      }

      // free(): void;
      // [Symbol.dispose](): void;
    };
    return rustCallStatus;
    //new wasmBundle.RustCallStatus() // FIXME: what is this rust call status value?
  }
);

const uniffiIsDebug =
  // @ts-ignore -- The process global might not be defined
  typeof process !== 'object' ||
  // @ts-ignore -- The process global might not be defined
  process?.env?.NODE_ENV !== 'production' ||
  false;


const stringConverter = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    stringToBytes: (s: string) => encoder.encode(s),
    bytesToString: (ab: UniffiByteArray) => decoder.decode(ab),
    stringByteLength: (s: string) => encoder.encode(s).byteLength,
  };
})();
const FfiConverterString = uniffiCreateFfiConverterString(stringConverter);








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

export const {{ record_def.name() | typescript_class_name }} = (() => {
  const defaults = () => ({});
  const create = (() => {
    return uniffiCreateRecord<{{ record_def.name() | typescript_class_name }}, ReturnType<typeof defaults>>(
      defaults
    );
  })();
  return Object.freeze({
    /**
     * Create a frozen instance of {@link ApiCredentials}, with defaults specified
     * in Rust, in the {@link {{ci.crate_name()}}} crate.
     */
    create,

    /**
     * Create a frozen instance of {@link ApiCredentials}, with defaults specified
     * in Rust, in the {@link {{ci.crate_name()}}} crate.
     */
    new: create,

    /**
     * Defaults specified in the {@link {{ci.crate_name()}}} crate.
     */
    defaults: () => Object.freeze(defaults()) as Partial<{{ record_def.name() | typescript_class_name }}>,
  });
})();

const {{ record_def.name() | typescript_ffi_converter_struct_enum_name }} = (() => {
  type TypeName = {{ record_def.name() | typescript_class_name }};
  class FFIConverter extends AbstractFfiConverterByteArray<TypeName> {
    read(from: RustBuffer): TypeName {
      return {
        {% for field_def in record_def.fields() -%}
          {{ field_def.name() | typescript_var_name }}: {{ field_def.as_type().borrow() | typescript_ffi_converter_name }}.read(from),
        {% endfor %}
      };
    }
    write(value: TypeName, into: RustBuffer): void {
      {% for field_def in record_def.fields() -%}
        {{ field_def.as_type().borrow() | typescript_ffi_converter_name }}.write(value.{{ field_def.name() | typescript_var_name }}, into);
      {% endfor %}
    }
    allocationSize(value: TypeName): number {
      return (
        {% for field_def in record_def.fields() -%}
          {{ field_def.as_type().borrow() | typescript_ffi_converter_name }}.allocationSize(value.{{ field_def.name() | typescript_var_name }})
          {%- if !loop.last %} +{% endif %}
        {% endfor %}
      );
    }
  }
  return new FFIConverter();
})();

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
  {% if func_def.return_type().is_some() %}let returnValue = {% endif -%}
  {% match func_def.throws_type() -%}
    {%- when Some(err) -%}
      uniffiCaller.rustCallWithError(
        /*liftError:*/ FfiConverterTypeAccessTokenError.lift.bind(FfiConverterTypeAccessTokenError), // FIXME: where does this error type come from?
        /*caller:*/ (callStatus) => {
    {%- else -%}
      uniffiCaller.rustCall(
        /*caller:*/ (callStatus) => {
    {%- endmatch %}
        console.log("{{ func_def.ffi_func().name() }} call starting...");
        const returnValue = FFI_DYNAMIC_LIB.{{ func_def.ffi_func().name() }}([
          {% for arg in func_def.arguments() -%}
            {{ arg.name() | typescript_var_name | typescript_ffi_converter_lower_with(arg.as_type().borrow()) }}
            {%- if !loop.last %}, {% endif %}
          {%- endfor -%}

          {%- if func_def.ffi_func().has_rust_call_status_arg() -%}
            {%- if !func_def.arguments().is_empty() %}, {% endif -%}
            callStatus
          {%- endif %}
        ]);
        console.log("{{ func_def.ffi_func().name() }} return value:", returnValue);
        return returnValue;
      // return nativeModule().ubrn_uniffi_livekit_uniffi_fn_func_generate_token(
      //   FfiConverterTypeTokenOptions.lower(options),
      //   FfiConverterOptionalTypeApiCredentials.lower(credentials),
      //   callStatus
      // );
      },
      /*liftString:*/ {{ &Type::String | typescript_ffi_converter_name }}.lift
  );

  {% if let Some(ret_type) = func_def.return_type() -%}
    return {{ "returnValue".into() | typescript_ffi_converter_lift_with(ret_type) }};
  {%- endif %}
}

{% endfor %}


// ==========
// FFI Layer
// ==========

import { DataType, JsExternal, open, /* close, */ define, load, arrayConstructor, restorePointer, wrapPointer, createPointer } from 'ffi-rs';

// FIXME: un hard code path and make it platform specific
open({ library: 'lib{{ ci.crate_name() }}', path: "/Users/ryan/w/livekit/rust-sdks/target/release/liblivekit_uniffi.dylib" })
// Release library memory when you're not using it.
// close('liblivekit_uniffi')

// Struct + Callback type definitions
type UniffiRustBuffer = { capacity: bigint, len: bigint, data: JsExternal };
const DataType_UniffiRustBuffer = {
  capacity: DataType.U64,
  len: DataType.U64,
  data: DataType.External,

  ffiTypeTag: DataType.StackStruct,
};

type UniffiRustCallStatus = { code: number, errorBuf: UniffiRustBuffer };
const DataType_UniffiRustCallStatus = {
  code: DataType.U8,
  errorBuf: DataType_UniffiRustBuffer,

  ffiTypeTag: DataType.StackStruct,
};

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

    const DataType_{{ struct_data.name() | typescript_ffi_struct_name }} = {
      {% for field_def in struct_data.fields() -%}
          {{field_def.name() | typescript_var_name}}: {{field_def.type_().borrow() | typescript_ffi_datatype_name}},
      {% endfor %}

      // Ensure that the struct is stack defined, without this ffi-rs isn't able to decode the
      // struct properly
      ffiTypeTag: DataType.StackStruct,
    };
    {%- else -%}
  {%- endmatch %}
{%- endfor %}


// Actual FFI functions from dynamic library
/** This direct / "extern C" type FFI interface is bound directly to the functions exposed by the
  * dynamic library. Using this manually from end-user javascript code is unsafe and this is not
  * recommended. */
const FFI_DYNAMIC_LIB = define({
    uniffi_new_call_status: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType_UniffiRustCallStatus,
      paramsType: [],
    },
    uniffi_new_rust_buffer: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType_UniffiRustBuffer,
      paramsType: [DataType.U8Array],
    },
    uniffi_get_call_status_pointer: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType.External,
      paramsType: [],
    },
    uniffi_get_call_status_code: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType.U8,
      paramsType: [],
    },
    uniffi_get_call_status_error_buf_byte_len: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType.U8,
      paramsType: [],
    },
    // uniffi_get_call_status_error_buf: {
    //   library: "lib{{ ci.crate_name() }}",
    //   retType: DataType.U64,
    //   paramsType: [],
    // },
    uniffi_get_call_status_error_buf: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType_UniffiRustBuffer,
      paramsType: [],
    },


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
            {%      if func.arguments().len() > 0 %}, {% endif -%}
            {{ &FfiType::RustCallStatus | typescript_ffi_datatype_name }}
            {%-   endif %}
          ],
        },

        {%- else %}
        {%- endmatch %}

    {%- endfor %}
}) as {
  uniffi_get_call_status_size: (args: []) => number,
  uniffi_new_call_status: (args: []) => UniffiRustCallStatus,
  uniffi_new_rust_buffer: (args: [Buffer]) => DataType_UniffiRustBuffer,
  uniffi_get_call_status_pointer: (args: []) => JsExternal,
  uniffi_get_call_status_code: (args: []) => number,
  uniffi_get_call_status_error_buf_byte_len: (args: []) => number,
  // uniffi_get_call_status_error_buf: (args: []) => JsExternal,
  uniffi_get_call_status_error_buf: (args: []) => UniffiRustBuffer,

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
