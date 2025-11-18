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

          {%- if func_def.ffi_func().has_rust_call_status_arg() -%}
            {%- if !func_def.arguments().is_empty() || func_def.self_type().is_some() %}, {% endif -%}
            callStatus
          {%- endif %}
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
        return FFI_DYNAMIC_LIB.{{ func_def.ffi_rust_future_complete(ci) }}([handle, callStatus])
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
            callStatus
          {%- endif %}
        ]);
        console.log("{{ func_def.ffi_func().name() }} return value:", returnValue{%- if func_def.ffi_func().has_rust_call_status_arg() -%}, 'Call status:', callStatus{%- endif -%});

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

const CALL_SUCCESS = 0, CALL_ERROR = 1, CALL_UNEXPECTED_ERROR = 2, CALL_CANCELLED = 3;

const [nullPointer] = unwrapPointer(createPointer({
  paramsType: [DataType.Void],
  paramsValue: [undefined]
}));

class UniffiFfiRsRustCaller {
  rustCall<T>(
    caller: (status: JsExternal) => T,
    liftString: (bytes: UniffiByteArray) => string,
  ): T {
    return this.makeRustCall(caller, liftString);
  }

  rustCallWithError<T>(
    liftError: (buffer: UniffiByteArray) => Error,
    caller: (status: JsExternal) => T,
    liftString: (bytes: UniffiByteArray) => string,
  ): T {
    return this.makeRustCall(caller, liftString, liftError);
  }

  createCallStatus(): [JsExternal] {
    const $callStatus = createPointer({
      paramsType: [DataType_UniffiRustCallStatus],
      paramsValue: [{
        code: CALL_SUCCESS,
        error_buf: { capacity: 0, len: 0, data: nullPointer } // TODO: is this the best way to pass a null pointer?
      }],
    });

    return $callStatus as [JsExternal];
  }

  createErrorStatus(code: number, errorBuf: UniffiByteArray): JsExternal {
    // FIXME: what is this supposed to do and how does it not allocate `errorBuf` when making the
    // call status struct?
    throw new Error('UniffiRustCaller.createErrorStatus is unimplemented.');

    // const status = this.statusConstructor();
    // status.code = code;
    // status.errorBuf = errorBuf;
    // return status;
  }

  makeRustCall<T>(
    caller: (status: JsExternal) => T,
    liftString: (bytes: UniffiByteArray) => string,
    liftError?: (buffer: UniffiByteArray) => Error,
  ): T {
    const $callStatus = this.createCallStatus();
    let returnedVal = caller(unwrapPointer($callStatus)[0]);

    const [callStatus] = restorePointer({
      retType: [DataType_UniffiRustCallStatus],
      paramsValue: $callStatus,
    });
    uniffiCheckCallStatus(callStatus, liftString, liftError);

    return returnedVal;
  }
}

function uniffiCheckCallStatus(
  callStatus: UniffiRustCallStatusStruct,
  liftString: (bytes: UniffiByteArray) => string,
  listError?: (buffer: UniffiByteArray) => Error,
) {
  switch (callStatus.code) {
    case CALL_SUCCESS:
      return;

    case CALL_ERROR: {
      // - Rust will not set the data pointer for a sucessful return.
      // - If unsuccesful, lift the error from the RustBuf and free.
      if (!isNullPointer(callStatus.error_buf.data)) {
        const struct = new UniffiRustBufferValue(callStatus.error_buf);
        const errorBufBytes = struct.consumeIntoUint8Array(); // FIXME: ADD FREE HERE

        if (listError) {
          throw listError(errorBufBytes);
        }
      }
      throw new UniffiInternalError.UnexpectedRustCallError();
    }

    case CALL_UNEXPECTED_ERROR: {
      // When the rust code sees a panic, it tries to construct a RustBuffer
      // with the message.  But if that code panics, then it just sends back
      // an empty buffer.

      if (!isNullPointer(callStatus.error_buf.data)) {
        const struct = new UniffiRustBufferValue(callStatus.error_buf);
        const errorBufBytes = struct.consumeIntoUint8Array(); // FIXME: ADD FREE HERE

        if (errorBufBytes.byteLength > 0) {
          const liftedErrorBuf = liftString(errorBufBytes);
          throw new UniffiInternalError.RustPanic(liftedErrorBuf);
        }
      }

      throw new UniffiInternalError.RustPanic("Rust panic");
    }

    case CALL_CANCELLED:
      // #RUST_TASK_CANCELLATION:
      //
      // This error code is expected when a Rust Future is cancelled or aborted, either
      // from the foreign side, or from within Rust itself.
      //
      // As of uniffi-rs v0.28.0, call cancellation is only checked for in the Swift bindings,
      // and uses an Unimplemeneted error.
      throw new UniffiInternalError.AbortError();

    default:
      throw new UniffiInternalError.UnexpectedRustCallStatusCode();
  }
}

// Get converters from the other files, if any.
const uniffiCaller = new UniffiFfiRsRustCaller();

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
          {{field_def.name() | typescript_var_name}}_: {{field_def | typescript_type_name}}
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

{% call docstring(object_def.docstring()) %}
export class {{ object_def.name() | typescript_class_name }} extends UniffiAbstractObject implements {{ object_def.name() | typescript_protocol_name }} {
  readonly [uniffiTypeNameSymbol] = '{{ object_def.name() }}';
  readonly [destructorGuardSymbol]: UniffiRustArcPtr;
  readonly [pointerLiteralSymbol]: UnsafeMutableRawPointer;

  // Constructors:
  {% for constructor_fn in object_def.constructors() -%}
  {% call docstring(constructor_fn.docstring()) %}
  {% if constructor_fn.is_primary_constructor() -%}
  constructor({%- call function_arg_list(constructor_fn) -%}) {
    super();

    {% for arg in constructor_fn.arguments() -%}
      let {{ arg.name() | typescript_argument_var_name }} = {{ arg.name() | typescript_var_name | typescript_ffi_converter_lower_with(arg.as_type().borrow()) }};
    {% endfor -%}

    const pointer = uniffiCaller.rustCall(
      /*caller:*/ (callStatus) => {
        return FFI_DYNAMIC_LIB.{{ constructor_fn.ffi_func().name() }}([
          {% for arg in constructor_fn.arguments() -%}
            {{ arg.name() | typescript_argument_var_name }}
            {%- if !loop.last %}, {% endif %}
          {%- endfor -%}

          {%- if constructor_fn.ffi_func().has_rust_call_status_arg() -%}
            {%- if !constructor_fn.arguments().is_empty() %}, {% endif -%}
            callStatus
          {%- endif %}
        ]);
      },
      /*liftString:*/ FfiConverterString.lift
    );

    {% for arg in constructor_fn.arguments() -%}
      {{ arg.name() | typescript_argument_var_name | typescript_ffi_converter_lower_with_cleanup(arg.as_type().borrow()) }}
    {% endfor -%}

    this[pointerLiteralSymbol] = pointer;
    this[destructorGuardSymbol] = {{ object_def.name() | typescript_ffi_object_factory_name }}.bless(pointer);
  }
  {%- else %}
    static {{ constructor_fn.name() | typescript_var_name }}(
      {%- call function_arg_list(constructor_fn) -%}
    ){% call function_return_type_or_void(constructor_fn) %} {
      {%- call function_call_body(constructor_fn) -%}
    }
  {%- endif %}
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
  // FIXME: maybe add `.clone()` method?
}

const {{ object_def.name() | typescript_ffi_object_factory_name }}: UniffiObjectFactory<{{ object_def.name() | typescript_class_name }}> =
  (() => {
    /// <reference lib="es2021" />
    const registry =
      typeof globalThis.FinalizationRegistry !== 'undefined'
        ? new globalThis.FinalizationRegistry<UnsafeMutableRawPointer>(
            (heldValue: UnsafeMutableRawPointer) => {
             {{ object_def.name() | typescript_ffi_object_factory_name }}.freePointer(heldValue);
            }
          )
        : null;

    return {
      create(pointer: UnsafeMutableRawPointer): {{ object_def.name() | typescript_class_name }} {
        const instance = Object.create({{ object_def.name() | typescript_class_name }}.prototype);
        instance[pointerLiteralSymbol] = pointer;
        instance[destructorGuardSymbol] = this.bless(pointer);
        instance[uniffiTypeNameSymbol] = '{{ object_def.name() }}';
        return instance;
      },

      bless(p: UnsafeMutableRawPointer): UniffiRustArcPtr {
        const ptr = {
          p, // make sure this object doesn't get optimized away.
          markDestroyed: () => undefined,
        };
        if (registry) {
          registry.register(ptr, p, ptr);
        }
        return ptr;
      },

      unbless(ptr: UniffiRustArcPtr) {
        if (registry) {
          registry.unregister(ptr);
        }
      },

      pointer(obj: {{ object_def.name() | typescript_class_name }}): UnsafeMutableRawPointer {
        if (typeof (obj as any)[destructorGuardSymbol] === 'undefined') {
          throw new UniffiInternalError.UnexpectedNullPointer();
        }
        return (obj as any)[pointerLiteralSymbol];
      },

      clonePointer(obj: {{ object_def.name() | typescript_class_name }}): UnsafeMutableRawPointer {
        const handleArg = this.pointer(obj);
        return uniffiCaller.rustCall(
          /*caller:*/ (callStatus) => {
            return FFI_DYNAMIC_LIB.{{ object_def.ffi_object_clone().name() }}([
              {% for arg in object_def.ffi_object_clone().arguments() -%}
                {{ arg.name() | typescript_argument_var_name }}
                {%- if !loop.last %}, {% endif %}
              {%- endfor -%}

              {%- if object_def.ffi_object_clone().has_rust_call_status_arg() -%}
                {%- if !object_def.ffi_object_clone().arguments().is_empty() %}, {% endif -%}
                callStatus
              {%- endif %}
            ]);
          },
          /*liftString:*/ FfiConverterString.lift
        );
      },

      freePointer(handleArg: UnsafeMutableRawPointer): void {
        uniffiCaller.rustCall(
          /*caller:*/ (callStatus) => {
            return FFI_DYNAMIC_LIB.{{ object_def.ffi_object_free().name() }}([
              {% for arg in object_def.ffi_object_free().arguments() -%}
                {{ arg.name() | typescript_argument_var_name }}
                {%- if !loop.last %}, {% endif %}
              {%- endfor -%}

              {%- if object_def.ffi_object_free().has_rust_call_status_arg() -%}
                {%- if !object_def.ffi_object_free().arguments().is_empty() %}, {% endif -%}
                callStatus
              {%- endif %}
            ]);
          },
          /*liftString:*/ FfiConverterString.lift
        );
      },

      isConcreteType(obj: any): obj is {{ object_def.name() | typescript_class_name }} {
        return (
          obj[destructorGuardSymbol] && obj[uniffiTypeNameSymbol] === '{{ object_def.name() }}'
        );
      },
    };
  })();

// FfiConverter for TodoListInterface
const {{ object_def.name() | typescript_ffi_converter_struct_enum_object_name }} = new FfiConverterObject(
  {{ object_def.name() | typescript_ffi_object_factory_name }}
);

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
  isNullPointer,
  PointerType,
  FieldType,
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

type UniffiForeignBytes = { len: number, data: JsExternal };
const DataType_UniffiForeignBytes = {
  len: DataType.I32,
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
    const [ dataPointer ] = createPointer({
      paramsType: [arrayConstructor({ type: DataType.U8Array, length: bytes.length })],
      paramsValue: [bytes],
    });

    const rustBuffer = uniffiCaller.rustCall(
      (callStatus) => {
        return FFI_DYNAMIC_LIB.ffi_livekit_uniffi_rustbuffer_from_bytes([
          // TODO: figure out why this is necessary.
          { data: unwrapPointer([dataPointer])[0], len: bytes.byteLength },
          callStatus,
        ]);
      },
      /*liftString:*/ {{ &Type::String | typescript_ffi_converter_name }}.lift,
    );

    freePointer({
      paramsType: [arrayConstructor({ type: DataType.U8Array, length: bytes.byteLength })],
      paramsValue: [dataPointer],
      pointerType: PointerType.RsPointer
    });

    return new UniffiRustBufferValue(rustBuffer);
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

    uniffiCaller.rustCall(
      (callStatus) => {
        FFI_DYNAMIC_LIB.ffi_livekit_uniffi_rustbuffer_free([this.struct, callStatus]);
      },
      /*liftString:*/ {{ &Type::String | typescript_ffi_converter_name }}.lift,
    );
    // freePointer({
    //   paramsType: [arrayConstructor({ type: DataType.U8Array, length: this.struct.len })],
    //   paramsValue: wrapPointer([this.struct.data]),
    //   pointerType: PointerType.RsPointer,
    // });

    // console.log('DONE');
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

type UniffiRustCallStatusStruct = { code: number, error_buf: UniffiRustBufferStruct };
const DataType_UniffiRustCallStatus = {
  code: DataType.U8,
  error_buf: DataType_UniffiRustBufferStruct,
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

    ffi_livekit_uniffi_rustbuffer_alloc: {
      library: "lib{{ ci.crate_name() }}",
      paramsType: [DataType.U64, DataType.External],
      retType: DataType_UniffiRustBufferStruct,
    },
    // ffi_livekit_uniffi_rustbuffer_from_bytes: {
    //   library: "lib{{ ci.crate_name() }}",
    //   paramsType: [DataType_UniffiForeignBytes, DataType.External],
    //   retType: DataType_UniffiRustBufferStruct,
    // },
    ffi_livekit_uniffi_rustbuffer_free: {
      library: "lib{{ ci.crate_name() }}",
      paramsType: [DataType_UniffiRustBufferStruct, DataType.External],
      retType: DataType.Void,
    },

    print_rust_buffer: {
      library: "lib{{ ci.crate_name() }}",
      paramsType: [DataType_UniffiRustBufferStruct],
      retType: DataType.Void,
    },


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
  ffi_livekit_uniffi_rustbuffer_alloc: (args: [bigint, JsExternal]) => UniffiRustBufferStruct,
  // ffi_livekit_uniffi_rustbuffer_from_bytes: (args: [UniffiForeignBytes, JsExternal]) => UniffiRustBufferStruct,
  ffi_livekit_uniffi_rustbuffer_free: (args: [UniffiRustBufferStruct, JsExternal]) => void,
  print_rust_buffer: (args: [UniffiRustBufferStruct]) => void,

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
