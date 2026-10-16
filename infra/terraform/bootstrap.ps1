<#
.SYNOPSIS
  Creates the Terraform state storage for Can I Run It (idempotent).

.DESCRIPTION
  Run once after `az login`. Creates or re-asserts:
    - resource group rg-ciri-tfstate
    - an Entra-only StorageV2 account (TLS 1.2, no public blob access,
      shared keys disabled, blob versioning, 7-day soft delete)
    - the tfstate container
    - Storage Blob Data Contributor on the account for the signed-in user
  Then prints the backend.hcl contents and the operator values for
  terraform.tfvars.

.EXAMPLE
  ./bootstrap.ps1 -StorageAccountName stciritfstate1234
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{3,24}$')]
    [string]$StorageAccountName,

    [string]$Location = 'polandcentral',
    [string]$ResourceGroupName = 'rg-ciri-tfstate',
    [string]$ContainerName = 'tfstate',
    [string]$StateKey = 'ciri-prod.tfstate'
)

$ErrorActionPreference = 'Stop'

# Storage Blob Data Contributor (built-in role definition ID).
$BlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

# Deliberately a simple function (no param block): an advanced function would
# bind az flags such as -o to PowerShell common parameters (-OutVariable).
function Invoke-Az {
    $output = & az @args
    if ($LASTEXITCODE -ne 0) {
        throw "az $($args -join ' ') failed with exit code $LASTEXITCODE"
    }
    return $output
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI (az) is not installed or not on PATH.'
}

$subscriptionId = Invoke-Az account show --query id -o tsv
$tenantId = Invoke-Az account show --query tenantId -o tsv
Write-Host "Subscription: $subscriptionId (tenant $tenantId)"

Write-Host "Resource group $ResourceGroupName..."
Invoke-Az group create --name $ResourceGroupName --location $Location --output none | Out-Null

$existing = @(Invoke-Az resource list --resource-group $ResourceGroupName --resource-type Microsoft.Storage/storageAccounts --query '[].name' -o tsv)
if ($existing -notcontains $StorageAccountName) {
    Write-Host "Creating storage account $StorageAccountName..."
    Invoke-Az storage account create `
        --name $StorageAccountName `
        --resource-group $ResourceGroupName `
        --location $Location `
        --kind StorageV2 `
        --sku Standard_LRS `
        --min-tls-version TLS1_2 `
        --https-only true `
        --allow-blob-public-access false `
        --allow-shared-key-access false `
        --output none | Out-Null
}
else {
    Write-Host "Storage account $StorageAccountName exists; re-asserting settings..."
    Invoke-Az storage account update `
        --name $StorageAccountName `
        --resource-group $ResourceGroupName `
        --min-tls-version TLS1_2 `
        --https-only true `
        --allow-blob-public-access false `
        --allow-shared-key-access false `
        --output none | Out-Null
}

Write-Host 'Blob versioning and 7-day soft delete...'
Invoke-Az storage account blob-service-properties update `
    --account-name $StorageAccountName `
    --resource-group $ResourceGroupName `
    --enable-versioning true `
    --enable-delete-retention true `
    --delete-retention-days 7 `
    --enable-container-delete-retention true `
    --container-delete-retention-days 7 `
    --output none | Out-Null

# container-rm goes through ARM, so it works before data-plane RBAC propagates.
$containerExists = Invoke-Az storage container-rm exists `
    --storage-account $StorageAccountName `
    --resource-group $ResourceGroupName `
    --name $ContainerName `
    --query exists -o tsv
if ($containerExists -ne 'true') {
    Write-Host "Creating container $ContainerName..."
    Invoke-Az storage container-rm create `
        --storage-account $StorageAccountName `
        --resource-group $ResourceGroupName `
        --name $ContainerName `
        --public-access off `
        --output none | Out-Null
}

$accountId = Invoke-Az storage account show --name $StorageAccountName --resource-group $ResourceGroupName --query id -o tsv
$userObjectId = Invoke-Az ad signed-in-user show --query id -o tsv
$userUpn = Invoke-Az ad signed-in-user show --query userPrincipalName -o tsv

$assignments = @(Invoke-Az role assignment list `
        --assignee $userObjectId `
        --role $BlobDataContributorRoleId `
        --scope $accountId `
        --query '[].id' -o tsv)
if ($assignments.Count -eq 0 -or [string]::IsNullOrWhiteSpace($assignments[0])) {
    Write-Host 'Granting Storage Blob Data Contributor to the signed-in user...'
    Invoke-Az role assignment create `
        --assignee-object-id $userObjectId `
        --assignee-principal-type User `
        --role $BlobDataContributorRoleId `
        --scope $accountId `
        --output none | Out-Null
    Write-Host 'Role assignments can take a few minutes to apply; wait before terraform init if it returns 403.'
}

Write-Host ''
Write-Host '--- backend.hcl ---'
Write-Host "resource_group_name  = `"$ResourceGroupName`""
Write-Host "storage_account_name = `"$StorageAccountName`""
Write-Host "container_name       = `"$ContainerName`""
Write-Host "key                  = `"$StateKey`""
Write-Host ''
Write-Host '--- terraform.tfvars (operator values) ---'
Write-Host "subscription_id    = `"$subscriptionId`""
Write-Host "operator_object_id = `"$userObjectId`""
Write-Host "operator_upn       = `"$userUpn`""
