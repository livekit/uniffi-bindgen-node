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

{% macro function_arg_list(func) %}
	{%- for arg in func.arguments() -%}
	    {%- let type_ = arg.as_type() -%}
	    {{ arg.name() | typescript_var_name }}: {{ arg | typescript_type_name }}
		{%- if !loop.last %}, {% endif -%}
	{%- endfor -%}
  {%- if func.is_async() -%}
    {%- if !func.arguments().is_empty() %}, {% endif -%}
    asyncOpts_?: { signal: AbortSignal }
  {%- endif -%}
{%- endmacro %}

{%- macro function_return_type(func_def) -%}
  {%- if let Some(ret_type) = func_def.return_type() -%}: {# space #}
    {%- if func_def.is_async() -%}Promise<{%- endif -%}
    {{ ret_type | typescript_type_name }}
    {%- if func_def.is_async() -%}>{%- endif -%}
  {%- endif %}
{%- endmacro -%}

{%- macro function_return_type_or_void(func_def) -%}
  {%- call function_return_type(func_def) -%}
  {%- if func_def.return_type().is_none() -%}: void{%- endif %}
{%- endmacro -%}

{% macro function_call_body(func_def, associated_object_name = "") %}
  {%- if func_def.is_async() %}
    /* Async function call: */
    let lastPollCallbackPointer: Array<JsExternal> | null = null;
    const cleanupLastPollCallbackPointer = () => {
      if (!lastPollCallbackPointer) {
        return;
      }

      console.log("async cleanup last poll callback pointer");
      freePointer({
        paramsType: [funcConstructor({
            paramsType: [DataType.U64, /* i8 */ DataType.U8],
            retType: DataType.Void,
        })],
        paramsValue: lastPollCallbackPointer,
        pointerType: PointerType.RsPointer,
      });
    };

    {% for arg in func_def.arguments() -%}
      let {{ arg.name() | typescript_argument_var_name }} = {{ arg.name() | typescript_var_name | typescript_ffi_converter_lower_with(arg.as_type().borrow()) }};
    {% endfor -%}

    const returnValue = await uniffiRustCallAsync(
      /*rustCaller:*/ uniffiCaller,
      /*rustFutureFunc:*/ () => {
        console.log("{{ func_def.ffi_func().name() }} async call starting...");
        const returnedHandle = FFI_DYNAMIC_LIB.{{ func_def.ffi_func().name() }}([
          {% if let Some(self_type) = func_def.self_type() -%}
            {{ associated_object_name | typescript_ffi_object_factory_name }}.clonePointer(this)
            {%- if !func_def.arguments().is_empty() %}, {% endif -%}
          {% endif -%}

          {% for arg in func_def.arguments() -%}
            {{ arg.name() | typescript_argument_var_name }}
            {%- if !loop.last %}, {% endif %}
          {%- endfor -%}
        ]);
        console.log("{{ func_def.ffi_func().name() }} returned handle:", returnedHandle);
        return returnedHandle;
      },
      /*pollFunc:*/ (handle, callback, callbackData) => {
        cleanupLastPollCallbackPointer();

        console.log("{{ func_def.ffi_func().name() }} async poll:", handle, callback, callbackData);
        const wrappedCallback = (callbackData: bigint, pollCodeRaw: number) => {
          // NOTE: ffi-rs doesn't support a DataType.I8 value under the hood, so instead `pollCode`
          // is being returned as a DataType.U8 as it is the same byte size. The below code
          // does the conversion from U8 -> I8.
          const pollCode = ((pollCodeRaw & 0b10000000) > 0 ? -1 : 1) * (pollCodeRaw & 0x01111111);

          console.log('{{ func_def.ffi_func().name() }} async poll callback fired with:', callbackData, pollCode);
          callback(
            BigInt(callbackData), /* FIXME: why must I convert callbackData from number -> bigint here? It looks like even though it is typed as DataType.U64 callbackData is passed as a number? */
            pollCode,
          );
        };
        const callbackExternal = createPointer({
          paramsType: [funcConstructor({
            paramsType: [DataType.U64, /* i8 */ DataType.U8],
            retType: DataType.Void,
          })],
          paramsValue: [wrappedCallback],
        });
        lastPollCallbackPointer = callbackExternal;
        const [ unwrapped ] = unwrapPointer(callbackExternal);

        FFI_DYNAMIC_LIB.{{ func_def.ffi_rust_future_poll(ci) }}([
          handle,
          unwrapped,
          Number(callbackData) /* FIXME: why must I convert callbackData from bigint -> number here for the ffi call to succeed? */
        ]);
        console.log('{{ func_def.ffi_func().name() }} async poll done');
        // setTimeout(() => { console.log('settimeout complete')}, 5000);
      },
      /*cancelFunc:*/ (handle) => {
        console.log('{{ func_def.ffi_func().name() }} async cancel:');
        return FFI_DYNAMIC_LIB.{{ func_def.ffi_rust_future_cancel(ci) }}([handle])
      },
      /*completeFunc:*/ (handle, callStatus) => {
        console.log('{{ func_def.ffi_func().name() }} async complete:');
        return FFI_DYNAMIC_LIB.{{ func_def.ffi_rust_future_complete(ci) }}([handle, callStatus.pointer])
      },
      /*freeFunc:*/ (handle) => {
        console.log('{{ func_def.ffi_func().name() }} async free:');
        cleanupLastPollCallbackPointer();
        return FFI_DYNAMIC_LIB.{{ func_def.ffi_rust_future_free(ci) }}([handle])
      },

      {% if let Some(ret_type) = func_def.return_type() -%}
        /*liftFunc:*/ (value) => {{ "value".into() | typescript_ffi_converter_lift_with(ret_type) }},
      {%- else -%}
        /*liftFunc:*/ (_v) => { /* void return value */ },
      {%- endif %}
      /*liftString:*/ FfiConverterString.lift,
      /*asyncOpts:*/ asyncOpts_
    );

    {% for arg in func_def.arguments() -%}
      {{ arg.name() | typescript_argument_var_name | typescript_ffi_converter_lower_with_cleanup(arg.as_type().borrow()) }}
    {% endfor -%}

    return returnValue;

  {% else %}
    /* Regular function call: */
    {% if func_def.return_type().is_some() %}const returnValue = {% endif -%}
    {%- match func_def.throws_type() -%}
      {%- when Some(err) -%}
        uniffiCaller.rustCallWithError(
          /*liftError:*/ FfiConverterTypeAccessTokenError.lift.bind(FfiConverterTypeAccessTokenError), // FIXME: where does this error type come from?
          /*caller:*/ (callStatus) => {
      {%- else -%}
        uniffiCaller.rustCall(
          /*caller:*/ (callStatus) => {
    {%- endmatch %}
        {% for arg in func_def.arguments() -%}
          let {{ arg.name() | typescript_argument_var_name }} = {{ arg.name() | typescript_var_name | typescript_ffi_converter_lower_with(arg.as_type().borrow()) }};
        {% endfor -%}

        console.log("{{ func_def.ffi_func().name() }} call starting...");
        const returnValue = FFI_DYNAMIC_LIB.{{ func_def.ffi_func().name() }}([
          {% if let Some(self_type) = func_def.self_type() -%}
            {{ associated_object_name | typescript_ffi_object_factory_name }}.clonePointer(this)
            {%- if !func_def.arguments().is_empty() %}, {% endif -%}
          {% endif -%}

          {% for arg in func_def.arguments() -%}
            {{ arg.name() | typescript_argument_var_name }}
            {%- if !loop.last %}, {% endif %}
          {%- endfor -%}

          {%- if func_def.ffi_func().has_rust_call_status_arg() -%}
            {%- if !func_def.arguments().is_empty() || func_def.self_type().is_some() %}, {% endif -%}
            callStatus.pointer
          {%- endif %}
        ]);
        console.log("{{ func_def.ffi_func().name() }} return value:", returnValue{%- if func_def.ffi_func().has_rust_call_status_arg() -%}, 'Call status:', callStatus.getValue(){%- endif -%});

        {% for arg in func_def.arguments() -%}
          {{ arg.name() | typescript_argument_var_name | typescript_ffi_converter_lower_with_cleanup(arg.as_type().borrow()) }}
        {% endfor -%}

        return returnValue;
      },
      /*liftString:*/ {{ &Type::String | typescript_ffi_converter_name }}.lift
    );

    {% if let Some(ret_type) = func_def.return_type() -%}
      return {{ "returnValue".into() | typescript_ffi_converter_lift_with(ret_type) }};
    {%- endif %}
  {% endif -%}
{%- endmacro %}





import {
  type UniffiByteArray,
  type UniffiDuration,
  AbstractFfiConverterByteArray,
  FfiConverterInt8,
  FfiConverterInt16,
  FfiConverterInt32,
  FfiConverterInt64,
  FfiConverterFloat32,
  FfiConverterFloat64,
  FfiConverterUInt8,
  FfiConverterUInt16,
  FfiConverterUInt32,
  FfiConverterUInt64,
  FfiConverterBool,
  FfiConverterDuration,
  UniffiTimestamp,
  FfiConverterTimestamp,
  FfiConverterOptional,
  FfiConverterArray,
  FfiConverterMap,
  FfiConverterArrayBuffer,
  FfiConverterObject,
  RustBuffer,
  UniffiError,
  UniffiInternalError,
  UniffiRustCaller,
  UniffiAbstractObject,
  UniffiRustArcPtr,
  UnsafeMutableRawPointer,
  UniffiObjectFactory,
  uniffiCreateFfiConverterString,
  uniffiCreateRecord,
  uniffiRustCallAsync,
  uniffiTypeNameSymbol,
  variantOrdinalSymbol,
  destructorGuardSymbol,
  pointerLiteralSymbol,
} from 'uniffi-bindgen-react-native';

// Get converters from the other files, if any.
const uniffiCaller = new UniffiRustCaller<UniffiRustCallStatusFacade>(
  () => {
    return UniffiRustCallStatusFacade.allocate();
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
  const defaults = () => ({}); // FIXME: add defaults here!
  const create = (() => {
    return uniffiCreateRecord<{{ record_def.name() | typescript_class_name }}, ReturnType<typeof defaults>>(
      defaults
    );
  })();
  return Object.freeze({
    /**
     * Create a frozen instance of {@link {{ record_def.name() | typescript_class_name }}}, with defaults specified
     * in Rust, in the {@link {{ci.crate_name()}}} crate.
     */
    create,

    /**
     * Create a frozen instance of {@link {{ record_def.name() | typescript_class_name }}}, with defaults specified
     * in Rust, in the {@link {{ci.crate_name()}}} crate.
     */
    new: create,

    /**
     * Defaults specified in the {@link {{ci.crate_name()}}} crate.
     */
    defaults: () => Object.freeze(defaults()) as Partial<{{ record_def.name() | typescript_class_name }}>,
  });
})();

const {{ record_def.name() | typescript_ffi_converter_struct_enum_object_name }} = (() => {
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

export const {{ enum_def.name() | typescript_ffi_converter_struct_enum_object_name }} = (() => {
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

{% for object_def in ci.object_definitions() %}
export type {{ object_def.name() | typescript_protocol_name }} = {
  {% for method_def in object_def.methods() %}
    {%- call docstring(method_def.docstring()) -%}
    {%- if method_def.is_async() -%}/* async */ {% endif -%}{{ method_def.name() | typescript_var_name }}(
      {%- call function_arg_list(method_def) -%}
    ){% call function_return_type_or_void(method_def) %};
  {% endfor %}
};

export class {{ object_def.name() | typescript_class_name }} extends UniffiAbstractObject implements {{ object_def.name() | typescript_protocol_name }} {
  readonly [uniffiTypeNameSymbol] = '{{ object_def.name() }}';
  readonly [destructorGuardSymbol]: UniffiRustArcPtr;
  readonly [pointerLiteralSymbol]: UnsafeMutableRawPointer;

  // FIXME: rename default static method constructor from `static new` -> `constructor`!
  // This might also require adding some other alternate construction path that other constructors
  // can use instead of `new Foo()`.

  // Constructors:
  {% for constructor_fn in object_def.constructors() -%}
  {% call docstring(constructor_fn.docstring()) %}
  static {{ constructor_fn.name() | typescript_var_name }}(
    {%- call function_arg_list(constructor_fn) -%}
  ){% call function_return_type_or_void(constructor_fn) %} {
    const object = new {{ object_def.name() | typescript_class_name }}();
    const pointer = uniffiCaller.rustCall(
      /*caller:*/ (callStatus) => {
        return FFI_DYNAMIC_LIB.{{ constructor_fn.ffi_func().name() }}([
          {% for arg in constructor_fn.arguments() -%}
            {{ arg.name() | typescript_argument_var_name }}
            {%- if !loop.last %}, {% endif %}
          {%- endfor -%}

          {%- if constructor_fn.ffi_func().has_rust_call_status_arg() -%}
            {%- if !constructor_fn.arguments().is_empty() %}, {% endif -%}
            callStatus.pointer
          {%- endif %}
        ]);
      },
      /*liftString:*/ FfiConverterString.lift
    );
    object[pointerLiteralSymbol] = pointer;
    object[destructorGuardSymbol] =
      uniffiTypeTodoListObjectFactory.bless(pointer);

    return object;
  }
  {%- endfor -%}

  // Methods:
  {% for method_def in object_def.methods() %}
    {% call docstring(method_def.docstring()) %}
    {%- if method_def.is_async() -%}async {% endif -%}{{ method_def.name() | typescript_var_name }}(
      {%- call function_arg_list(method_def) -%}
    ){% call function_return_type_or_void(method_def) %} {
      {%- call function_call_body(method_def, object_def.name()) -%}
    }
  {% endfor %}

  /**
   * {@inheritDoc uniffi-bindgen-react-native#UniffiAbstractObject.uniffiDestroy}
   */
  uniffiDestroy(): void {
    const ptr = (this as any)[destructorGuardSymbol];
    if (typeof ptr !== 'undefined') {
      const pointer = {{ object_def.name() | typescript_ffi_object_factory_name }}.pointer(this);
      {{ object_def.name() | typescript_ffi_object_factory_name }}.freePointer(pointer);
      {{ object_def.name() | typescript_ffi_object_factory_name }}.unbless(ptr);
      delete (this as any)[destructorGuardSymbol];
    }
  }
  [Symbol.dispose] = this.uniffiDestroy

  static instanceOf(obj: any): obj is {{ object_def.name() | typescript_class_name }} {
    return {{ object_def.name() | typescript_ffi_object_factory_name }}.isConcreteType(obj);
  }

  // FIXME: maybe add `.equal(a, b)` static method like many protobuf libraries have?
}
{% endfor %}

// ==========
// Function definitions:
// ==========

{% for func_def in ci.function_definitions() %}
{% call docstring(func_def.docstring()) %}
export {% if func_def.is_async() %}async {% endif %}function {{ func_def.name() | typescript_fn_name }}(
  {%- call function_arg_list(func_def) -%}
){%- if let Some(ret_type) = func_def.return_type() -%}: {% if func_def.is_async() -%}
  Promise<{%- endif -%}{{ ret_type | typescript_type_name }}{%- if func_def.is_async() -%}>{%- endif -%}
{%- endif %} {
  {%- call function_call_body(func_def) -%}
}

{% endfor %}


// ==========
// FFI Layer
// ==========

import {
  DataType,
  JsExternal,
  open, /* close, */
  define,
  load,
  arrayConstructor,
  funcConstructor,
  restorePointer,
  wrapPointer,
  unwrapPointer,
  createPointer,
  freePointer,
  PointerType,
} from 'ffi-rs';

// FIXME: un hard code path and make it platform specific
open({ library: 'lib{{ ci.crate_name() }}', path: "/Users/ryan/w/livekit/rust-sdks/target/release/liblivekit_uniffi.dylib" })
// Release library memory when you're not using it.
// close('liblivekit_uniffi')

// Struct + Callback type definitions
type UniffiRustBufferStruct = { capacity: bigint, len: bigint, data: JsExternal };
const DataType_UniffiRustBufferStruct = {
  capacity: DataType.U64,
  len: DataType.U64,
  data: DataType.External,

  ffiTypeTag: DataType.StackStruct,
};

/** A UniffiRustBufferValue represents stack allocated structure containing pointer to series of
  * bytes most likely on the heap, along with the size of that data in bytes.
  *
  * It is often used to encode more complex function parameters / return values like structs,
  * optionals, etc.
  *
  * `RustBufferValue`s are behind the scenes backed by manually managed memory on the rust end, and
  * must be explictly destroyed when no longer used to ensure no memory is leaked.
  * TODO: set up finalizationregistry.
  * */
class UniffiRustBufferValue {
  private struct: UniffiRustBufferStruct | null;

  constructor(struct: UniffiRustBufferStruct) {
    this.struct = struct;
  }

  static allocateWithBytes(bytes: Uint8Array) {
    const [dataPointer] = createPointer({
      paramsType: [arrayConstructor({ type: DataType.U8Array, length: bytes.length })],
      paramsValue: [bytes],
    });

    const [ dataPointerUnwrapped ] = unwrapPointer([dataPointer]);

    return new UniffiRustBufferValue({
      len: bytes.length,
      capacity: bytes.length,
      data: dataPointerUnwrapped,
    });
  }

  static allocateEmpty() {
    return UniffiRustBufferValue.allocateWithBytes(new Uint8Array());
  }

  toStruct() {
    if (!this.struct) {
      throw new Error('Error getting struct data for UniffiRustBufferValue - struct.data has been freed! This is not allowed.');
    }
    return this.struct;
  }

  toUint8Array() {
    if (!this.struct) {
      throw new Error('Error converting rust buffer to uint8array - struct.data has been freed! This is not allowed.');
    }
    if (this.struct.len > Number.MAX_VALUE) {
      throw new Error(`Error converting rust buffer to uint8array - rust buffer length is ${this.struct.len}, which cannot be represented as a Number safely.`)
    }

    const [contents] = restorePointer({
      retType: [arrayConstructor({ type: DataType.U8Array, length: Number(this.struct.len) })],
      paramsValue: wrapPointer([this.struct.data]),
    });

    return new Uint8Array(contents);
  }

  consumeIntoUint8Array() {
    const result = this.toUint8Array();
    this.destroy();
    return result;
  }

  destroy() {
    console.log('Rust buffer destroy called', this.struct)
    if (!this.struct) {
      throw new Error('Error destroying UniffiRustBufferValue - already previously destroyed! Double freeing is not allowed.');
    }

    // FIXME: why can't I call uniffi_destroy_rust_buffer here and need to do the free manually?
    // FFI_DYNAMIC_LIB.uniffi_destroy_rust_buffer([this.struct]);
    freePointer({
      paramsType: [arrayConstructor({ type: DataType.U8Array, length: this.struct.len })],
      paramsValue: wrapPointer([this.struct.data]),
      pointerType: PointerType.RsPointer,
    });

    this.struct = null;
  }
}

/** The UniffiRustBufferFacade is used to give a {@link UniffiRustBufferValue} a
  * {@link UniffiRustBufferStruct} type interface so it can be passed into places where a
  * {@link UniffiRustBufferStruct} is expected.
  *
  * It also provides a mechanism to free the underlying UniffiRustBufferValue, which calling
  * rustBufferValue.toStruct() wouldn't provide. */
class UniffiRustBufferFacade implements UniffiRustBufferStruct {
  // private pointer: StructPointer<UniffiRustBufferStruct, typeof DataType_UniffiRustBufferStruct> | null;
  private value: UniffiRustBufferValue;

  constructor(
    rustBuffer: UniffiRustBufferValue,
  ) {
    this.value = rustBuffer;
  }

  get len() {
    return this.value.toStruct().len;
  }
  get capacity() {
    return this.value.toStruct().capacity;
  }
  get data() {
    return this.value.toStruct().data;
  }

  free() {
    // if (!this.pointer) {
    //   throw new Error('Error destroying UniffiRustBufferValue - already previously destroyed! Double freeing is not allowed.');
    // }

    // this.pointer.free();
    this.value.destroy();
  }
}


type UniffiRustCallStatusStruct = { code: number, errorBuf?: UniffiRustBufferStruct };
const DataType_UniffiRustCallStatus = {
  code: DataType.U8,
  errorBuf: DataType_UniffiRustBufferStruct,

  ffiTypeTag: DataType.StackStruct,
};

/** A UniffiRustCallStatus represents the result of a function call. It must be cleaned up by
  * calling .free() once it is no longer used because it contains fields which can refer to data
  * on the heap. */
class UniffiRustCallStatus {
  private struct: UniffiRustCallStatusStruct | null;
  private errorBuf: UniffiRustBufferValue | null;

  private constructor(struct: UniffiRustCallStatusStruct, errorBuf: UniffiRustBufferValue) {
    this.struct = struct;
    this.errorBuf = errorBuf;
  }

  static allocate() {
    const buffer = UniffiRustBufferValue.allocateEmpty();
    const struct = { code: 0, errorBuf: buffer.toStruct() };
    return new UniffiRustCallStatus(struct, buffer);
  }

  toStruct() {
    if (!this.struct || !this.errorBuf) {
      throw new Error('Error getting struct form of UniffiRustCallStatusNew - struct has already been freed! This is not allowed.');
    }
    return this.struct;
  }

  free() {
    console.log('UniffiRustCallStatus FREE CALLED');
    if (!this.struct || !this.errorBuf) {
      throw new Error('Error freeing UniffiRustCallStatusNew - already been freed! This is not allowed.');
    }

    this.errorBuf.destroy();
    this.errorBuf = null;
    this.struct = null;
  }
}

class StructPointer<Struct extends object, StructDataType> {
  private _pointer: JsExternal | null;
  get pointer(): JsExternal {
    if (!this._pointer) {
      throw new Error('Error resolving pointer for UniffiRustCallStatusPointer - pointer has been freed! This is not allowed.');
    }
    return this._pointer;
  }

  private dataType: StructDataType;
  private struct: Struct | null;
  private structName: string;

  constructor(struct: Struct, dataType: StructDataType, structName: string) {
    this.struct = struct;
    this.dataType = dataType;
    this.structName = structName;

    const [ pointer ] = createPointer({
      paramsType: [this.dataType],
      paramsValue: [this.struct],
    });
    this._pointer = pointer;
  }

  toStruct() { return this.struct; }

  // FIXME: make this private, right now it is public so it can be logged for debugging
  getValue(): Struct {
    const [ contents ] = restorePointer({
      retType: [this.dataType],
      paramsValue: [this.pointer],
    });
    return contents;
  }

  free() {
    console.log(`StructPointer ${this.structName} FREE CALLED`);
    if (!this._pointer) {
      throw new Error(`Error resolving pointer for ${this.structName} - pointer has already been freed! This is not allowed.`);
    }

    freePointer({
      paramsType: [this.dataType],
      paramsValue: [this._pointer],
      pointerType: PointerType.RsPointer,
    });
    this._pointer = null;
  }
}

/** A single purpose facade meant to adapt {@link UniffiRustCallStatus} to satisify the contract of {@link UniffiRustCaller} */
class UniffiRustCallStatusFacade {
  private structPointer: StructPointer<UniffiRustCallStatusStruct, typeof DataType_UniffiRustCallStatus> | null;
  get pointer(): JsExternal {
    if (!this.structPointer) {
      throw new Error('Error resolving pointer for UniffiRustCallStatusPointer - pointer has been freed! This is not allowed.');
    }
    return this.structPointer.pointer;
  }

  private callStatus: UniffiRustCallStatus | null;

  private constructor(
    callStatusPointer: StructPointer<UniffiRustCallStatusStruct, typeof DataType_UniffiRustCallStatus>,
    callStatus: UniffiRustCallStatus,
  ) {
    this.structPointer = callStatusPointer;
    this.callStatus = callStatus;
  }

  static allocate() {
    const value = UniffiRustCallStatus.allocate();
    const structPointer = new StructPointer(
      value.toStruct(),
      DataType_UniffiRustCallStatus,
      'UniffiRustCallStatusFacade',
    );

    return new UniffiRustCallStatusFacade(structPointer, value);
  }

  // FIXME: make this private, right now it is public so it can be logged for debugging
  getValue() {
    const [ contents ] = restorePointer({
      retType: [DataType_UniffiRustCallStatus],
      paramsValue: [this.pointer],
    });
    return contents;
  }

  get code(): number {
    const value = this.getValue();

    // Note: do this free here to temporarily hack around no explicit `.free()` being done by
    // UniffiRustCaller on this object
    if (value.code === 0) {
      this.free();
    }

    return value.code;
  }

  get errorBuf(): UniffiByteArray | undefined {
    const value = this.getValue();

    // FIXME: should value.code be checked for `0` here and `undefined` returned?
    // That seems logical given the return type but check existing bindgens and see if
    // that is what they do here.

    const result = (new UniffiRustBufferValue(value.errorBuf)).toUint8Array();

    // Note: do this free here to temporarily hack around no explicit `.free()` being done by
    // UniffiRustCaller on this object
    this.free();

    return result;
  }

  free() {
    console.log('UniffiRustCallStatusFacade FREE CALLED');
    if (!this.structPointer || !this.callStatus) {
      throw new Error('Error freeing UniffiRustCallStatusFacade - it has already been freed! This is not allowed.');
    }

    this.structPointer.free();
    this.structPointer = null;

    this.callStatus.free();
    this.callStatus = null;
  }
}

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
    uniffi_destroy_rust_buffer: {
      library: "lib{{ ci.crate_name() }}",
      retType: DataType.Void,
      paramsType: [DataType_UniffiRustBufferStruct],
    },




    // uniffi_free_rust_buffer: {
    //   library: "lib{{ ci.crate_name() }}",
    //   retType: DataType.Void,
    //   paramsType: [DataType.External],
    // },


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
      retType: DataType_UniffiRustBufferStruct,
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
  uniffi_destroy_rust_buffer: (args: [UniffiRustBufferStruct]) => void,

  // uniffi_free_rust_buffer: (args: [JsExternal]) => void,
  uniffi_get_call_status_size: (args: []) => number,
  uniffi_get_call_status_pointer: (args: []) => JsExternal,
  uniffi_get_call_status_code: (args: []) => number,
  uniffi_get_call_status_error_buf_byte_len: (args: []) => number,
  // uniffi_get_call_status_error_buf: (args: []) => JsExternal,
  uniffi_get_call_status_error_buf: (args: []) => UniffiRustBufferStruct,

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
