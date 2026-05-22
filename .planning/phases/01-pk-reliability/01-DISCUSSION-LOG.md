# Discussion Log — Phase 1: PK Connection Reliability

**Date:** 2026-05-23

## Areas Discussed

### Retry Strategy
- **Question:** PK房间创建/加入失败后如何重试？
- **Options:** 3次重试+1s间隔 / 1次重试 / 不加重试
- **Selected:** 3次重试+1s间隔
- **Notes:** Only retry on network/timeout errors, not logical errors

### Error Messages
- **Question:** 错误提示需要区分哪些类型？
- **Options:** 网络超时 / 房间不存在 / 房间已满 / 保持现有
- **Selected:** 网络超时, 房间不存在, 房间已满 (all three)

### Offline Detection
- **Question:** 如何处理离线检测？
- **Options:** navigator.onLine / 依赖Firebase报错
- **Selected:** navigator.onLine check before PK operations

## Deferred Ideas
- (none)

## Claude's Discretion
- Retry backoff: 1s fixed (not exponential given simplicity)
- Error message wording: decided inline
- Offline check: add to both pkCreate and pkJoin functions
