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
