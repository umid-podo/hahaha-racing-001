# 레이싱 게임

아이패드·휴대폰 한 기기에서 여럿이 동시에 터치해 즐기는 2D 레이싱 웹 게임입니다. 빌드 없이 `index.html`, `style.css`, `game.js`로 실행됩니다.

## 실행

```sh
python3 -m http.server 8000   # http://localhost:8000
```

## 테스트

```sh
cd tests && npm install && npm test
```

Playwright로 로컬 Chrome을 띄워 화면을 확인합니다. Chrome이 설치되어 있어야 합니다. 다른 Chromium을 쓰려면 `CHROME_PATH=/경로/chrome npm test`로 실행합니다.

## 기획

[planning/README.md](planning/README.md)에 기획서, 캐릭터 시트, 보완 기획이 있습니다. 원본 손그림 사진(`IMG_*`)은 개인 메모라 저장소에 포함하지 않았습니다.

## 배포 (GitHub Pages)

주소: https://umid-podo.github.io/hahaha-racing-001/

`main`에 push하면 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)이 게임 실행에 필요한 파일만 모아 배포한다. 문서와 테스트는 사이트에 올라가지 않는다. 게임이 새 파일이나 폴더를 쓰게 되면 워크플로의 `Collect game files` 단계에도 추가한다. 빠뜨리면 사이트에서 404가 난다.

### Claude Code Cloud에서 배포

"배포해줘"라는 요청을 받으면 아래 순서대로 진행한다. 클라우드 세션은 자기 작업 브랜치에만 push할 수 있으므로 PR로 `main`에 반영한다.

1. 테스트: `cd tests && npm install && npm test`. Chrome이 설치된 환경에서만 돌아간다. Chrome이 없으면(Claude Code Cloud 등) 건너뛰고, 건너뛰었다고 사용자에게 알린다.
2. 변경 사항을 커밋하고 작업 브랜치를 push한다.
   ```sh
   git push -u origin HEAD
   ```
3. PR을 만들고 병합한다. 병합되면 `main` push로 배포가 자동으로 시작된다. 이미 열린 PR이 있으면 새로 만들지 않고 그 PR을 병합한다.
   ```sh
   gh pr create --repo umid-podo/hahaha-racing-001 --base main --fill
   gh pr merge --repo umid-podo/hahaha-racing-001 --merge
   ```
4. 병합이 막히면 작업 브랜치를 바로 배포한다. `github-pages` 환경은 `main`과 `claude/*` 브랜치의 배포만 허용한다.
   ```sh
   gh workflow run deploy-pages.yml --repo umid-podo/hahaha-racing-001 --ref "$(git branch --show-current)"
   ```
   이 경우 `main`에는 아직 반영되지 않았으므로 사용자에게 PR 병합을 요청한다. 병합하지 않으면 다음 `main` 배포가 이 변경을 덮어쓴다.
5. 배포 실행이 끝날 때까지 기다린다. 실행 목록에 바로 보이지 않으면 몇 초 뒤 다시 조회한다.
   ```sh
   gh run list --repo umid-podo/hahaha-racing-001 --workflow deploy-pages.yml --limit 1
   gh run watch <실행 ID> --repo umid-podo/hahaha-racing-001 --exit-status
   ```
6. 사이트가 `200`을 돌려주는지 확인하고 주소를 사용자에게 알린다. 클라우드 네트워크에서 `github.io`에 접속할 수 없으면 5번의 성공 결과로 대신하고, 그렇게 보고한다.
   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://umid-podo.github.io/hahaha-racing-001/
   ```

### 로컬에서 배포

`main`에서 커밋하고 `git push`하면 된다. 확인은 위 5~6번과 같다.

### 처음 설정 (완료됨)

저장소 Settings → Pages의 Source는 **GitHub Actions**이고, Settings → Environments → `github-pages`의 배포 브랜치는 `main`, `claude/*`로 제한되어 있다. Pages 설정이 꺼졌다면 아래 명령으로 다시 켠다.

```sh
gh api -X POST repos/umid-podo/hahaha-racing-001/pages -f build_type=workflow
```

배포 브랜치 제한이 사라졌다면 아래 명령으로 되살린다. 마지막 줄이 `claude/*,main`을 출력하면 된다.

```sh
echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' | gh api -X PUT repos/umid-podo/hahaha-racing-001/environments/github-pages --input -
gh api -X POST repos/umid-podo/hahaha-racing-001/environments/github-pages/deployment-branch-policies -f name=main -f type=branch
gh api -X POST repos/umid-podo/hahaha-racing-001/environments/github-pages/deployment-branch-policies -f name='claude/*' -f type=branch
gh api repos/umid-podo/hahaha-racing-001/environments/github-pages/deployment-branch-policies --jq '[.branch_policies[].name]|join(",")'
```
