# Import System Overview

The import center is the backbone of BaseballHelm's no-direct-integration strategy. It must support CSV/Excel imports, manual entry, uploaded PDFs/reports as attachments, image uploads, video links, and future vendor mappings without requiring live APIs.

## Flow

Upload → detect file type → select import type → map columns → preview rows → validate → player match → duplicate detection → commit batch → audit history → rollback if needed.
