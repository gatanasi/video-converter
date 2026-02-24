# [2.5.0](https://github.com/gatanasi/video-converter/compare/v2.4.2...v2.5.0) (2026-02-24)


### Bug Fixes

* enforce file download behavior for iOS Safari ([#168](https://github.com/gatanasi/video-converter/issues/168)) ([dc2383c](https://github.com/gatanasi/video-converter/commit/dc2383ca0aceb5eadfe9eb738ec949c4aaa98580))


### Features

* **frontend:** add URL hash routing for tabs ([#165](https://github.com/gatanasi/video-converter/issues/165)) ([9d0c8fc](https://github.com/gatanasi/video-converter/commit/9d0c8fc390578c1d8c7f3919b66d978a455b9199))

# [2.4.0](https://github.com/gatanasi/video-converter/compare/v2.3.7...v2.4.0) (2026-01-30)


### Bug Fixes

* **frontend:** address remaining PR review comments ([f967794](https://github.com/gatanasi/video-converter/commit/f96779409a590eb1f03a5204a290881671b23a6e))
* **frontend:** use CSS variables for btn.secondary and btn.ghost dark mode ([467f4a2](https://github.com/gatanasi/video-converter/commit/467f4a2ab76e0b1b18922d5046a3ed359bf819dc))
* **ui:** improve responsive layout and alignment ([#144](https://github.com/gatanasi/video-converter/issues/144)) ([7124163](https://github.com/gatanasi/video-converter/commit/71241633d3ccbb457dc67541ebc4a40f500c7a28))
* **ui:** improve responsive layout and alignment issues ([ef01c42](https://github.com/gatanasi/video-converter/commit/ef01c42c7f6b6cad5081ea360f2387130eebe3d1))


### Features

* **frontend:** migrate CSS from vanilla to Tailwind CSS v4 ([8951397](https://github.com/gatanasi/video-converter/commit/89513978114e8d127a9a7bae8844ff3bd8f754e2))
* **frontend:** migrate CSS from vanilla to Tailwind CSS v4 ([#143](https://github.com/gatanasi/video-converter/issues/143)) ([658e3e8](https://github.com/gatanasi/video-converter/commit/658e3e8850b94a173ca7f1fb5891ac01cfa34720))

## [2.3.4](https://github.com/gatanasi/video-converter/compare/v2.3.3...v2.3.4) (2025-12-17)


### Bug Fixes

* **ci:** add setup-qemu-action for arm64 builds ([86ee410](https://github.com/gatanasi/video-converter/commit/86ee410b8b48f16bffba1f9859f9482141810255))
* **docker:** enable community repo for alpine 3.23 support ([38addf6](https://github.com/gatanasi/video-converter/commit/38addf672c1cbd874bf8c31bef77df3abdf6af1c))

## [2.3.3](https://github.com/gatanasi/video-converter/compare/v2.3.2...v2.3.3) (2025-11-16)


### Bug Fixes

* **Dockerfile:** correct pnpm filter syntax for frontend dependencies ([3a7c033](https://github.com/gatanasi/video-converter/commit/3a7c03375a724f66d4dbeebcd5cbfe1629f6bf4c))

# [2.3.0](https://github.com/gatanasi/video-converter/compare/v2.2.0...v2.3.0) (2025-10-12)


### Bug Fixes

* **app:** add cleanup on window unload to prevent memory leaks ([83ecfc3](https://github.com/gatanasi/video-converter/commit/83ecfc36a7a69422378f0179d79f6f3c2712de9c))
* **fileList:** remove redundant comment for clearing container ([a5f8807](https://github.com/gatanasi/video-converter/commit/a5f8807a8f7c0d824628844e42b5f14c32f9be16))
* **styles:** clean up media queries and improve layout for responsiveness ([1b2e6ff](https://github.com/gatanasi/video-converter/commit/1b2e6ffeaf242511ffbb3525ba56f9e61a54bb57))
* **styles:** enhance table layout and responsiveness for video and file tables ([692670a](https://github.com/gatanasi/video-converter/commit/692670af1b470399413adbf85c28749792a6beb4))
* **styles:** enhance video and file list container styles for better layout and responsiveness ([625aa8d](https://github.com/gatanasi/video-converter/commit/625aa8db2608f7c8d70675ef235c2c78b0b6ff65))
* **styles:** remove redundant overflow properties and clean up form options styles ([cd75e43](https://github.com/gatanasi/video-converter/commit/cd75e4322b6825754231dd0e94f59d33f68b893e))
* **styles:** remove unused .hidden class to clean up CSS ([50f8eb3](https://github.com/gatanasi/video-converter/commit/50f8eb302dcbe4f3673e1656eb730127038672c7))
* **styles:** update primary color variables and enhance button styles for better theming ([a647714](https://github.com/gatanasi/video-converter/commit/a647714adfd7e2b18decb5e47cd66cbb51716864))
* **theme:** implement AbortController for theme management and cleanup on destroy ([3c73395](https://github.com/gatanasi/video-converter/commit/3c73395742b44567b5a62d5bd92b3c44d4f16243))
* **theme:** update theme handling to listen for system theme changes and apply accordingly ([fd99387](https://github.com/gatanasi/video-converter/commit/fd99387e9383dc590d0c5d5647002a7771cef593))
* **theme:** update theme toggle button aria-label for clarity ([00969a2](https://github.com/gatanasi/video-converter/commit/00969a241d9a9d59151e4cd0bebf67345d1bc6f5))
* **videoList:** update wrapper class name to maintain layout integrity ([755f190](https://github.com/gatanasi/video-converter/commit/755f190c54d28d7ef9db1c46869b0f60f48dc4fc))


### Features

* **theme:** refactor theme storage key and enhance theme initialization logic ([b0b409a](https://github.com/gatanasi/video-converter/commit/b0b409aa92e72009d8a2c70452bbca7704f1345f))
* **ui:** New look & feel ([2111d02](https://github.com/gatanasi/video-converter/commit/2111d02ab5a356a6d2ad92681c0bb11a8ea634a1))
* **ui:** New look & feel ([#91](https://github.com/gatanasi/video-converter/issues/91)) ([77c8c76](https://github.com/gatanasi/video-converter/commit/77c8c7672925fda2cee59ca91ad0571344e7cf36))

# [2.2.0](https://github.com/gatanasi/video-converter/compare/v2.1.2...v2.2.0) (2025-10-12)


### Bug Fixes

* adjust filename sanitization to handle cases where extension exceeds max length ([eac3139](https://github.com/gatanasi/video-converter/commit/eac3139d7d2036d38f316c6c46745b5f9d370db3))
* **sse:** add connection confirmation event to SSE stream handler ([c652a28](https://github.com/gatanasi/video-converter/commit/c652a288b62c275896c05dece0b123a6a4146ae8))
* **tests:** address critical timeout and health check issues ([d6fd658](https://github.com/gatanasi/video-converter/commit/d6fd6586b5c172cf91615953c987a8b26081772f))


### Features

* **tests:** add smoke tests for Video Converter application ([f817de4](https://github.com/gatanasi/video-converter/commit/f817de4db50b3092808c1ebcc7942fe71b8c6910))
* **tests:** add smoke tests for Video Converter application ([#90](https://github.com/gatanasi/video-converter/issues/90)) ([7ab3b4a](https://github.com/gatanasi/video-converter/commit/7ab3b4a853abbe93591aea467c7372131ef3dff8))

## [2.1.2](https://github.com/gatanasi/video-converter/compare/v2.1.1...v2.1.2) (2025-10-11)


### Bug Fixes

* **docker:** add SYS_NICE capability to video-converter service in docker-compose.yml ([0693f6b](https://github.com/gatanasi/video-converter/commit/0693f6b27ae6410a901e45a5030d5c7899587672))
* **docs:** update allowed origins in .env.example and README for local development ([2b729f2](https://github.com/gatanasi/video-converter/commit/2b729f2475e9a087fc034a4bf3a7a2673d0993b5))
* **docs:** update environment variable loading instructions and improve Docker setup documentation ([ae01c04](https://github.com/gatanasi/video-converter/commit/ae01c048d3636d809798be8232cd31ff754f6a3b))

## [2.1.1](https://github.com/gatanasi/video-converter/compare/v2.1.0...v2.1.1) (2025-10-11)


### Bug Fixes

* **docker:** replace wget with curl in healthcheck and Dockerfile ([7a2fcf5](https://github.com/gatanasi/video-converter/commit/7a2fcf58f85de3bbfaca673fe2f458711f6ab877))

# [2.1.0](https://github.com/gatanasi/video-converter/compare/v2.0.1...v2.1.0) (2025-10-11)


### Bug Fixes

* **docker:** enhance Dockerfile and docker-compose.yml ([#86](https://github.com/gatanasi/video-converter/issues/86)) ([1c31776](https://github.com/gatanasi/video-converter/commit/1c3177697037d9e6af1a7c6c05c1ab1c16909e64))
* **docker:** enhance Dockerfile and docker-compose.yml for improved caching and security ([6b5356e](https://github.com/gatanasi/video-converter/commit/6b5356ea138ac1c9d8098f0955ebbc5b3abd5ed8))
* **docker:** enhance entrypoint script for directory validation and ownership management ([644dfa3](https://github.com/gatanasi/video-converter/commit/644dfa3f0f98014b63743d5d5c83d582fa1cfe46))
* **docker:** update PNPM version and improve Dockerfile and docker-compose.yml structure ([bc1a73f](https://github.com/gatanasi/video-converter/commit/bc1a73f6a34f2b85efad4d2f2ebdde5c081751ce))


### Features

* **docker:** add entrypoint script and update Dockerfile for improved user permissions ([1ca807a](https://github.com/gatanasi/video-converter/commit/1ca807ab1fd382b58d9d0529f8c4a1559f836379))

# [2.0.0](https://github.com/gatanasi/video-converter/compare/v1.4.0...v2.0.0) (2025-10-10)


### Bug Fixes

* **ci:** correct go.sum path for cache key ([054521f](https://github.com/gatanasi/video-converter/commit/054521fb924fb1f821a9014fcff440b744f5d35a))
* **ci:** remove invalid working-directory from setup-go action ([1c9d392](https://github.com/gatanasi/video-converter/commit/1c9d39200e837f5876bd647349781c9a14a7c8c7))
* **ci:** resolve workflow warnings ([3b34a63](https://github.com/gatanasi/video-converter/commit/3b34a63129bf3562d5d863e65c5bae4dd5ab57b8))
* **ci:** specify working directory for Go setup step ([f5a6804](https://github.com/gatanasi/video-converter/commit/f5a680426e76b1f65dba599cd93a91d45f16f3b1))
* **ci:** use built-in Go cache from setup-go action ([b5fccb0](https://github.com/gatanasi/video-converter/commit/b5fccb0e4e32a87bd1d7b6def2012b2a2aa5ed4a))
* disable write timeout for SSE stream endpoint ([802a4dc](https://github.com/gatanasi/video-converter/commit/802a4dcd2e854516afc10e30e97747ae9301c193))
* handle error when setting write deadline for SSE stream ([eeeb9f9](https://github.com/gatanasi/video-converter/commit/eeeb9f9b2f595810ddabaff255c0f73f1496d626))
* update conversion quality option description from 'slow' to 'medium' ([de11837](https://github.com/gatanasi/video-converter/commit/de11837be8c61c521c7a7ecfb4abf317b7388300))
* update default go_lint_version to 'latest' ([3d3a361](https://github.com/gatanasi/video-converter/commit/3d3a361e1ed3c009ccc5a40f45bd6531769d72e2))
* update default go_lint_version to v2.2.0 ([d252a2c](https://github.com/gatanasi/video-converter/commit/d252a2c3f6293ba327793168691cc0badd495e15))
* update npm configuration to use security minimum release age ([9d03891](https://github.com/gatanasi/video-converter/commit/9d03891e3d968492e1b02b74a44ad3310afdd2b5))


### Features

* containerize application with Docker and migrate to GHCR deployment ([092ec88](https://github.com/gatanasi/video-converter/commit/092ec88c3aff1235c583ac354311a49b458c39be))


### BREAKING CHANGES

* Deployment method changed from binary artifacts to Docker images. Previous releases with backend binary and frontend zip are no longer produced. Use Docker images from ghcr.io/gatanasi/video-converter instead.

# [1.4.0](https://github.com/gatanasi/video-converter/compare/v1.3.1...v1.4.0) (2025-09-28)


### Features

* add configuration manager for API base URL retrieval ([99f8e8c](https://github.com/gatanasi/video-converter/commit/99f8e8c455283b4cfa00aea2cb17e10190b05ea8))
* implement Server-Sent Events ([d0d339d](https://github.com/gatanasi/video-converter/commit/d0d339d0cdc587565a9df351c6745e412090e169))

# [1.3.0](https://github.com/gatanasi/video-converter/compare/v1.2.4...v1.3.0) (2025-09-28)


### Features

* add video quality presets ([e8290ad](https://github.com/gatanasi/video-converter/commit/e8290ad4c97fec581239eb3dc9ff55ec6006c7bd))

## [1.2.1](https://github.com/gatanasi/video-converter/compare/v1.2.0...v1.2.1) (2025-05-04)


### Bug Fixes

* remove redundant argument from exiftool command in video conversion ([30ac0e3](https://github.com/gatanasi/video-converter/commit/30ac0e39369965a94e652195f4b284c3a04b4c2f))

# [1.2.0](https://github.com/gatanasi/video-converter/compare/v1.1.4...v1.2.0) (2025-05-03)


### Bug Fixes

* use UUID for fallback sanitized filename in UploadConvertHandler ([61e5997](https://github.com/gatanasi/video-converter/commit/61e59974473654469bb4d3cfbced39168658102d))
* use UUID for unique conversion IDs ([1c86706](https://github.com/gatanasi/video-converter/commit/1c86706fcb8662fcbb7a5937e08cf986394f51c6))
* use UUID for unique conversion IDs ([#41](https://github.com/gatanasi/video-converter/issues/41)) ([3d22f34](https://github.com/gatanasi/video-converter/commit/3d22f34689cf8fd5914c3c696dac964a40637e15))


### Features

* add upload progress bar ([2c392d5](https://github.com/gatanasi/video-converter/commit/2c392d5440edc0bda533842b5bf6767e6d7de6ad))
* Add upload progress bar ([#42](https://github.com/gatanasi/video-converter/issues/42)) ([e464b8f](https://github.com/gatanasi/video-converter/commit/e464b8f95b741db12d48eb97932b00c15d9aa53b))

## [1.1.3](https://github.com/gatanasi/video-converter/compare/v1.1.2...v1.1.3) (2025-04-21)


### Bug Fixes

* Add app_version input to build jobs and update release workflow ([cfd20de](https://github.com/gatanasi/video-converter/commit/cfd20de3c95e9eaeb5dc2f40e97afc37a79fa7c8))

## [1.1.2](https://github.com/gatanasi/video-converter/compare/v1.1.1...v1.1.2) (2025-04-21)


### Bug Fixes

* Add upload artifacts option to build jobs and update workflow names ([e8a111f](https://github.com/gatanasi/video-converter/commit/e8a111f36e02d98c117ba9eff155c20f933fc1ae))

## [1.1.1](https://github.com/gatanasi/video-converter/compare/v1.1.0...v1.1.1) (2025-04-21)


### Bug Fixes

* Correct output path for backend build artifact ([671ba91](https://github.com/gatanasi/video-converter/commit/671ba91ab0d6492eb8d38451454246275bb7c162))
* Correct path for backend build artifact upload ([d10542c](https://github.com/gatanasi/video-converter/commit/d10542c655df61a0c3743173399d48cb1d94a7a8))
* Correct path for backend build artifact upload ([03dfad2](https://github.com/gatanasi/video-converter/commit/03dfad2cd91c7d5df0065e97ff403a99d101e8ea))

# [1.1.0](https://github.com/gatanasi/video-converter/compare/v1.0.0...v1.1.0) (2025-04-21)


### Bug Fixes

* Enhance path validation and error handling in video conversion ([#21](https://github.com/gatanasi/video-converter/issues/21)) ([6b9d9b1](https://github.com/gatanasi/video-converter/commit/6b9d9b1453b70805ec9e81d7962ec45e652e696b))
* Enhance path validation and error handling in video conversion handlers ([a4ecefb](https://github.com/gatanasi/video-converter/commit/a4ecefb87ed806de56d7bba1fd55739cc817261c))


### Features

* Implement path validation for file operations to enhance security ([de9ecab](https://github.com/gatanasi/video-converter/commit/de9ecab941a83437772a6dec73b004bb72db054a))
* Implement safe file removal with security validations in handlers ([8055443](https://github.com/gatanasi/video-converter/commit/8055443e97f3a4cf3786edd95a8af3f8fa1c5b89))
* Refactor file validation logic for improved security and error handling ([ac0ee18](https://github.com/gatanasi/video-converter/commit/ac0ee181f69b7b5003fde6c76eebd613905285f6))
