param(
  [string]$ProjectRef = 'llmmtdzlurunphdfrqlg',
  [string]$ExpectedProjectRef = 'llmmtdzlurunphdfrqlg',
  [string]$ResumeDirectory = ''
)

$ErrorActionPreference = 'Stop'

if ($ProjectRef -ne $ExpectedProjectRef) {
  throw 'Refusing to back up an unexpected Supabase project.'
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupRoot = Join-Path $workspace 'work\phase4b1-seoul-backup'
$postgresBin = Join-Path $workspace 'work\tools\postgresql-17.11\pgsql\bin'
$pgDump = Join-Path $postgresBin 'pg_dump.exe'
$pgDumpAll = Join-Path $postgresBin 'pg_dumpall.exe'
$pgRestore = Join-Path $postgresBin 'pg_restore.exe'

if (-not (Test-Path -LiteralPath $pgDump)) {
  throw 'Portable PostgreSQL tooling is missing.'
}

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

function Read-TemporaryExport([string]$DryRun, [string]$Name) {
  $match = [regex]::Match(
    $DryRun,
    ('export ' + [regex]::Escape($Name) + '="([^"]+)"')
  )
  if (-not $match.Success) {
    throw "Temporary $Name was not returned by Supabase."
  }
  return $match.Groups[1].Value
}

function Set-TemporaryDatabaseLogin {
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $dryRunLines = & npx.cmd --yes supabase@latest db dump --linked --dry-run 2>&1
  $dryRunExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  if ($dryRunExitCode -ne 0) {
    throw 'Supabase did not issue a temporary database backup login.'
  }
  $dryRun = $dryRunLines | Out-String

  $env:PGHOST = Read-TemporaryExport $dryRun 'PGHOST'
  $env:PGPORT = Read-TemporaryExport $dryRun 'PGPORT'
  $env:PGUSER = Read-TemporaryExport $dryRun 'PGUSER'
  $env:PGPASSWORD = Read-TemporaryExport $dryRun 'PGPASSWORD'
  $env:PGDATABASE = Read-TemporaryExport $dryRun 'PGDATABASE'
  $env:PGSSLMODE = 'require'
  $env:PGCONNECT_TIMEOUT = '20'

  # Supabase creates this short-lived login on demand. Allow pooler propagation.
  Start-Sleep -Seconds 8
}

function Test-MissingOrEmpty([string]$Path) {
  return (-not (Test-Path -LiteralPath $Path)) -or ((Get-Item -LiteralPath $Path).Length -eq 0)
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
if ($ResumeDirectory) {
  $destination = (Resolve-Path $ResumeDirectory).Path
  if (-not $destination.StartsWith($backupRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to resume outside the approved backup directory.'
  }
  $stamp = Split-Path $destination -Leaf
}
else {
  $destination = Join-Path $backupRoot $stamp
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
}

try {
  $schemaFile = Join-Path $destination 'schema-and-history.sql'
  if (Test-MissingOrEmpty $schemaFile) {
    Set-TemporaryDatabaseLogin
    & $pgDump '--schema-only' '--schema=public' '--schema=supabase_migrations' '--role=postgres' '--quote-all-identifiers' '--no-owner' '--file' $schemaFile
    if ($LASTEXITCODE -ne 0) { throw 'Schema export failed.' }
    [ordered]@{ stage = 'schema'; file = $schemaFile; bytes = (Get-Item $schemaFile).Length } | ConvertTo-Json
    return
  }

  $dataFile = Join-Path $destination 'application-data-and-history.sql'
  if (Test-MissingOrEmpty $dataFile) {
    Set-TemporaryDatabaseLogin
    & $pgDump '--data-only' '--schema=public' '--schema=supabase_migrations' '--role=postgres' '--no-owner' '--no-privileges' '--file' $dataFile
    if ($LASTEXITCODE -ne 0) { throw 'Application data export failed.' }
    [ordered]@{ stage = 'application-data'; file = $dataFile; bytes = (Get-Item $dataFile).Length } | ConvertTo-Json
    return
  }

  $completeFile = Join-Path $destination 'application-complete.backup'
  if (Test-MissingOrEmpty $completeFile) {
    Set-TemporaryDatabaseLogin
    & $pgDump '--format=custom' '--schema=public' '--schema=supabase_migrations' '--role=postgres' '--no-owner' '--file' $completeFile
    if ($LASTEXITCODE -ne 0) { throw 'Custom application backup failed.' }
    [ordered]@{ stage = 'complete-archive'; file = $completeFile; bytes = (Get-Item $completeFile).Length } | ConvertTo-Json
    return
  }

  $authFile = Join-Path $destination 'auth-data.backup'
  if (Test-MissingOrEmpty $authFile) {
    Set-TemporaryDatabaseLogin
    & $pgDump '--format=custom' '--data-only' '--schema=auth' '--role=postgres' '--no-owner' '--no-privileges' '--file' $authFile
    if ($LASTEXITCODE -ne 0) { throw 'Auth data export failed.' }
    [ordered]@{ stage = 'auth-data'; file = $authFile; bytes = (Get-Item $authFile).Length } | ConvertTo-Json
    return
  }

  $rolesFile = Join-Path $destination 'roles-without-passwords.sql'
  if (Test-MissingOrEmpty $rolesFile) {
    Set-TemporaryDatabaseLogin
    & $pgDumpAll '--roles-only' '--no-role-passwords' '--role=postgres' '--file' $rolesFile
    if ($LASTEXITCODE -ne 0) { throw 'Role export failed.' }
    [ordered]@{ stage = 'roles'; file = $rolesFile; bytes = (Get-Item $rolesFile).Length } | ConvertTo-Json
    return
  }

  $archiveListFile = Join-Path $destination 'application-complete.contents.txt'
  $archiveList = & $pgRestore '--list' $completeFile
  if ($LASTEXITCODE -ne 0) { throw 'Custom backup verification failed.' }
  [System.IO.File]::WriteAllLines($archiveListFile, [string[]]$archiveList)

  $files = Get-ChildItem -LiteralPath $destination -File | ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
    [ordered]@{
      name = $_.Name
      bytes = $_.Length
      sha256 = $hash.Hash.ToLowerInvariant()
    }
  }

  $manifest = [ordered]@{
    project_ref = $ProjectRef
    captured_at_utc = $stamp
    backup_type = 'PostgreSQL logical export plus verified custom archive'
    includes = @(
      'public schema and application data',
      'supabase_migrations schema and ledger',
      'functions, triggers, RLS policies, indexes, and grants',
      'auth schema data',
      'roles without passwords'
    )
    files = $files
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $destination 'manifest.json'),
    ($manifest | ConvertTo-Json -Depth 8)
  )

  [ordered]@{
    backup_directory = $destination
    captured_at_utc = $stamp
    verified_archive_entries = $archiveList.Count
    files = $files
  } | ConvertTo-Json -Depth 8
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
