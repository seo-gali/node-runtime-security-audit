# Node.js 보안 업데이트 결과 — 2026-10-22

공유 Node를 **24.19.0 → 24.22.1**로 업데이트했고, 새 프로세스의 버전·호환성 검사는 통과했다. **기존 프로세스 20개는 여전히 24.19.0을 사용하므로 전체 작업은 미완료다.**

## 점검 범위와 실제 사용 현황

사용자가 지정한 현재 PC의 Windows 프로세스·서비스·예약 작업·수신 포트 및 로컬 Docker/WSL 상태를 점검했다. 별도 서버는 범위에 포함하지 않았다.

| 구분 | 확인된 실행 환경 | 결과 |
| --- | --- | --- |
| 웹서버 | `marketing-ai-agent`, Python 3.13.14, 실제 서버 PID 26520, 부모 PID 11028, 127.0.0.1:8000 | 실행 중인 Node 웹서버는 발견되지 않았다. Python 서버 GET `/`는 HTTP 200이다. |
| 크롤러 | `comment-crawler`, `vibeCrawling` | 실행 프로세스가 없어 기존 실제 실행 버전은 확인할 수 없다. 버전 지정 파일은 발견되지 않았고, 공유 경로로 새로 실행하는 Node는 24.22.1이다. 설치된 수집·파싱·브라우저 라이브러리의 기능 검사는 통과했다. |
| 자동화 에이전트·도구 | Codex Node 실행 래퍼 4개, npx 래퍼 8개, Playwright MCP 4개, Context7 MCP 4개 | 기존 20개 모두 실제 메모리 매핑 이미지가 `C:\ProgramData\nvm\v24.19.0\node.exe`다. 재시작 대기 상태다. 마케팅 에이전트의 서버 자체는 Python이다. |
| 별도 봇 | 해당하는 실행 프로세스·Node 서비스·예약 작업이 발견되지 않음 | 실행 버전 및 실제 봇 기능을 검증할 대상이 확인되지 않았다. |
| Docker / WSL | 설치된 WSL 배포판은 DockSlate. Docker가 “runtime installed and stopped” 오류 반환 | 중지 상태를 유지했다. 컨테이너별 Node 버전·기능은 미검증이다. |

## 적용한 변경과 백업

- 공식 2026-10-21 보안 릴리스의 현재 메이저 수정 버전 24.22.1을 적용했다.
- `C:\ProgramData\nvm\v24.19.0` 전체를 `backup-v24.19.0`에 복사했다. robocopy 종료 코드 1은 정상 복사 완료이며, Node 원본·백업 SHA-256도 일치했다.
- 기존 버전 디렉터리도 그대로 보존했다. 작업 후 원본 Node 해시가 바뀌지 않았음을 재확인했다.
- `C:\ProgramData\nvm\v24.22.1`에 기존 CLI 구성을 복제하고, `node.exe`를 공식 보안 바이너리로 교체했다. `C:\nvm4w\nodejs`의 NVM 링크를 이 디렉터리로 전환했다.
- npm 11.17.0, Corepack 0.35.0, Codex 0.163.0과 실행 shim·패키지 매니페스트를 보존·대조했다. 프로젝트 소스, 의존성 및 lock 파일은 변경하지 않았다.
- 원래 존재하던 파일과 설치 버전은 삭제하지 않았다. 작업 중 생성한 실패한 임시 재연결·DLL 진단 파일만 정리했다.
- 기존 v20.19.6·v24.12.0·v24.17.0 설치는 수정하지 않았다. 현재 사용 중인 프로세스에서는 발견되지 않았다.

공식 다운로드: `https://nodejs.org/dist/v24.22.1/win-x64/node.exe`

- SHA-256: `D702DAA815EABBFF763C7D3808E235CF031CF2CA70211B56847BC72F51E240E5`
- 공식 `SHASUMS256.txt`와 일치한다.
- Authenticode: Valid, OpenJS Foundation 서명.
- 새 Node의 네이티브 모듈 ABI: 137. 기존 24.19.0과 같다.

## 실행한 검증과 실제 종료 상태

| 명령·검사 | 실제 결과 |
| --- | --- |
| `downloads\node.exe verify-runtime.cjs` | 전환 전 7개 검사 통과, 종료 0 |
| `C:\nvm4w\nodejs\node.exe verify-runtime.cjs` | 전환 후 7개 검사 통과, 종료 0. 새 프로세스 PID 15604가 직접 `process.version=v24.22.1`, 공유 `execPath`를 보고했다. 검사 프로세스는 정상 종료했다. |
| `npm.cmd --version`, `corepack.cmd --version`, `codex.cmd --version` | 각각 11.17.0, 0.35.0, codex-cli 0.163.0. 모두 종료 0 |
| `Invoke-WebRequest http://127.0.0.1:8000/` | HTTP 200 |
| `python.exe verify-processes.py` | 종료 **2**. 활성 기본 Node는 v24.22.1이나, 실행 중 20개 모두 24.19.0. `AllRunningPatched=false` |

7개 기능 검사는 다음 범위다.

1. 실제 Node 버전·ABI, DNS NUL 입력 거부, TLS 호스트명 불일치 거부, Brotli 압축·해제.
2. 로컬 HTTP 서버와 fetch의 Brotli 응답 처리·반복 요청.
3. comment-crawler의 설치된 Express 로드, Axios HTTP 수집, Cheerio 파싱, Puppeteer 브라우저 추출.
4. vibeCrawling의 같은 라이브러리 기능.
5. Playwright의 실제 Chrome 탐색·버튼 클릭·DOM 확인.
6. 새 Node에서 시작한 Playwright MCP의 초기화와 도구 25개 응답.
7. 새 Node에서 시작한 Context7 MCP의 초기화와 도구 2개 응답.

크롤러 검사는 별도 로컬 fixture와 시스템 Chrome을 명시해 실행했다. 실제 사이트 수집, MongoDB 연결·쓰기, 로그인·게시, 운영 앱 전체 E2E는 수행하지 않았다. 특히 vibeCrawling의 기본 Puppeteer 설정이 찾는 Chrome 116.0.5845.96은 캐시에 없어 별도 조치가 필요하다. 앱의 브라우저 설정을 수정하거나 Chrome을 새로 설치하지는 않았다.

## 남은 재시작과 실패 원인

기존 Node PID: 1340, 2700, 4704, 11348, 14232, 14428, 17552, 18652, 18656, 19004, 19552, 19612, 20152, 20232, 20368, 20376, 20472, 24112, 25292, 25368.

MCP 16개는 공유 Codex app-server PID 17764의 자손이다. 이 관리자가 현재 작업도 호스팅한다. 기존 세션을 정상 재시작하는 연결을 확보하지 못해 강제 종료하지 않았다.

- 공식 `config/mcpServer/reload` API를 확인했다.
- 현재 Codex CLI의 로컬 제어 포트 4개는 `/healthz`에 HTTP 401을 반환했다.
- 비밀값 없이 연결할 수 있는 공식 로컬 control socket도 시도했으나 Windows에서 `connect EACCES`를 반환했다.
- 인증 토큰, 비밀 파일 및 비밀 환경변수 값은 열람하지 않았다.
- 진단용 PowerShell DLL 로드도 접근 거부되어, 새 DLL을 쓰지 않는 Python 표준 라이브러리로 메모리 매핑 검사를 완료했다.
- 최초 NVM 전환은 링크 생성 지연을 검증에서 탐지해 구버전으로 복구했다. 링크 준비를 확인한 재시도는 성공했다.

Codex 세션과 공유 백그라운드 app-server/MCP를 완전히 재시작한 뒤 아래를 실행해야 전체 적용 여부를 확인할 수 있다. 터미널 창만 닫아 백그라운드 관리자가 남으면 적용이 끝나지 않을 수 있다.

```powershell
& 'D:\01_Programming\08_AI\Agent\marketing-ai-agent\.venv\Scripts\python.exe' 'C:\Users\user\node-security-20261022\verify-processes.py'
$LASTEXITCODE
& 'C:\nvm4w\nodejs\node.exe' 'C:\Users\user\node-security-20261022\verify-runtime.cjs'
$LASTEXITCODE
```

완료 기준은 첫 명령의 `AllRunningPatched=true`, `PendingRestartCount=0`, 두 검증의 종료 코드 0이다. 그 전에는 기존 프로세스에 이번 보안 수정이 적용됐다고 볼 수 없다.

## 롤백

기존 런타임과 별도 전체 백업이 모두 남아 있다. 호환성 문제로 필요할 때만 다음 명령으로 기본 경로를 복구하고 영향을 받는 프로세스를 다시 시작한다. 구버전으로 복구하면 이번 취약점도 다시 노출된다.

```powershell
& 'C:\ProgramData\nvm\nvm.exe' use 24.19.0 64
```

## 근거 파일과 공식 자료

- `download-verification.json`, `downloads/SHASUMS256.txt`: 다운로드·해시·서명 검사.
- `rollback.json`, `backup-v24.19.0/`: 롤백 정보·기존 런타임 전체 백업.
- `activation.json`: 활성 NVM 대상·버전·해시.
- `processes-before.json`, `mapped-processes-before.json`, `processes-after.json`: 전후 프로세스와 실제 매핑 이미지.
- `compatibility-before-switch.json`, `verification-after-switch.json`: 새 프로세스에서 통과한 검사 결과.
- [Node.js 공식 보안 공지](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js 24.22.1 공식 릴리스](https://nodejs.org/en/blog/release/v24.22.1)
- [OpenAI 공식 app-server 문서](https://learn.chatgpt.com/docs/app-server)
