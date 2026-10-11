import fetch_url from './fetch_url.js';
import fetch_batch from './fetch_batch.js';
import fetch_raw from './fetch_raw.js';
import fetch_head from './fetch_head.js';
import fetch_options from './fetch_options.js';
import redirect_trace from './redirect_trace.js';
import http_status from './http_status.js';
import fetch_api from './fetch_api.js';
import fetch_graphql from './fetch_graphql.js';
import fetch_soap from './fetch_soap.js';
import post_form from './post_form.js';
import post_multipart from './post_multipart.js';
import download_file from './download_file.js';
import stream_fetch from './stream_fetch.js';
import fetch_with_proxy from './fetch_with_proxy.js';
import websocket_listen from './websocket_listen.js';
import sse_subscribe from './sse_subscribe.js';
import fetch_retry from './fetch_retry.js';
import fetch_ingest from './fetch_ingest.js';

export default [
  // Smart System composite
  fetch_ingest,
  fetch_url,
  fetch_batch,
  fetch_raw,
  fetch_head,
  fetch_options,
  redirect_trace,
  http_status,
  fetch_api,
  fetch_graphql,
  fetch_soap,
  post_form,
  post_multipart,
  download_file,
  stream_fetch,
  fetch_with_proxy,
  websocket_listen,
  sse_subscribe,
  fetch_retry,
];
