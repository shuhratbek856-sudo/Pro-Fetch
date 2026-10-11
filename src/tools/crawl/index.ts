import crawl_site from './crawl_site.js';
import sitemap_read from './sitemap_read.js';
import extract_links from './extract_links.js';
import extract_tables from './extract_tables.js';
import extract_pagination from './extract_pagination.js';
import spa_render from './spa_render.js';
import robots_check from './robots_check.js';
import crawl_depth_control from './crawl_depth_control.js';
import url_queue_manage from './url_queue_manage.js';
import crawl_pause_resume from './crawl_pause_resume.js';
import extract_metadata from './extract_metadata.js';
import canonical_url from './canonical_url.js';
import crawl_domain_scope from './crawl_domain_scope.js';
import crawl_filter from './crawl_filter.js';
import crawl_speed from './crawl_speed.js';
import crawl_result_merge from './crawl_result_merge.js';
import link_graph from './link_graph.js';
import broken_links from './broken_links.js';
import page_weight from './page_weight.js';
import crawl_export from './crawl_export.js';

export default [
  crawl_site,
  sitemap_read,
  extract_links,
  extract_tables,
  extract_pagination,
  spa_render,
  robots_check,
  crawl_depth_control,
  url_queue_manage,
  crawl_pause_resume,
  extract_metadata,
  canonical_url,
  crawl_domain_scope,
  crawl_filter,
  crawl_speed,
  crawl_result_merge,
  link_graph,
  broken_links,
  page_weight,
  crawl_export,
];
