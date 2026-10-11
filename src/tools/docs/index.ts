import arxiv_paper_read from './arxiv_paper_read.js';
import doi_resolve from './doi_resolve.js';
import pubmed_read from './pubmed_read.js';
import rfc_read from './rfc_read.js';
import w3c_spec_read from './w3c_spec_read.js';
import mdn_docs_read from './mdn_docs_read.js';
import stackoverflow_read from './stackoverflow_read.js';
import npm_package_read from './npm_package_read.js';
import pypi_package_read from './pypi_package_read.js';
import dockerhub_read from './dockerhub_read.js';
import huggingface_model_card from './huggingface_model_card.js';
import readthedocs_fetch from './readthedocs_fetch.js';
import wikipedia_deep_read from './wikipedia_deep_read.js';
import changelog_read from './changelog_read.js';
import registry_api_read from './registry_api_read.js';

export default [
  arxiv_paper_read,
  doi_resolve,
  pubmed_read,
  rfc_read,
  w3c_spec_read,
  mdn_docs_read,
  stackoverflow_read,
  npm_package_read,
  pypi_package_read,
  dockerhub_read,
  huggingface_model_card,
  readthedocs_fetch,
  wikipedia_deep_read,
  changelog_read,
  registry_api_read,
];
