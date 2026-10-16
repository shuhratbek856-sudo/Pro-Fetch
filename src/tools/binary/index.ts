import parquetRead from './parquet_read.js';
import avroRead from './avro_read.js';
import arrowIpcRead from './arrow_ipc_read.js';
import protobufDecode from './protobuf_decode.js';

export default [parquetRead, avroRead, arrowIpcRead, protobufDecode];
