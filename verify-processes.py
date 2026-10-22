import ctypes
from ctypes import wintypes
import datetime
import json
import subprocess
import sys

EXPECTED = '24.22.1'
ACTIVE = r'C:\nvm4w\nodejs\node.exe'
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
version_api = ctypes.WinDLL('version', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.QueryDosDeviceW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
psapi.GetMappedFileNameW.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.LPWSTR, wintypes.DWORD]
version_api.GetFileVersionInfoSizeW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
version_api.GetFileVersionInfoW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID]
version_api.VerQueryValueW.argtypes = [wintypes.LPCVOID, wintypes.LPCWSTR, ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.UINT)]


def file_version(path):
    unused = wintypes.DWORD()
    size = version_api.GetFileVersionInfoSizeW(path, ctypes.byref(unused))
    if not size:
        raise ctypes.WinError(ctypes.get_last_error())
    data = ctypes.create_string_buffer(size)
    if not version_api.GetFileVersionInfoW(path, 0, size, data):
        raise ctypes.WinError(ctypes.get_last_error())
    pointer, length = wintypes.LPVOID(), wintypes.UINT()
    if not version_api.VerQueryValueW(data, '\\', ctypes.byref(pointer), ctypes.byref(length)):
        raise ctypes.WinError(ctypes.get_last_error())
    fixed = ctypes.cast(pointer, ctypes.POINTER(wintypes.DWORD * 13)).contents
    assert fixed[0] == 0xFEEF04BD, 'Invalid version metadata'
    return f'{fixed[2] >> 16}.{fixed[2] & 65535}.{fixed[3] >> 16}'


def main():
    command = "$items=@(Get-Process -Name node,nodejs -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{PID=$_.Id;Base=$_.MainModule.BaseAddress.ToInt64();Started=$_.StartTime.ToUniversalTime().ToString('o')} }); ConvertTo-Json -InputObject $items -Compress"
    raw = subprocess.check_output([r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile', '-Command', command], creationflags=subprocess.CREATE_NO_WINDOW)
    processes = json.loads(raw.decode('utf-8-sig'))
    device = ctypes.create_unicode_buffer(4096)
    if not kernel.QueryDosDeviceW('C:', device, 4096):
        raise ctypes.WinError(ctypes.get_last_error())
    rows = []
    for process in processes:
        handle = kernel.OpenProcess(1040, False, process['PID'])
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            mapped = ctypes.create_unicode_buffer(4096)
            if not psapi.GetMappedFileNameW(handle, process['Base'], mapped, 4096):
                raise ctypes.WinError(ctypes.get_last_error())
            assert mapped.value.lower().startswith(device.value.lower() + '\\'), 'Unverified image drive'
            physical = 'C:' + mapped.value[len(device.value):]
            rows.append({'PID': process['PID'], 'Version': file_version(physical), 'Image': physical, 'Started': process['Started']})
        finally:
            kernel.CloseHandle(handle)
    active = subprocess.check_output([ACTIVE, '--version'], text=True, creationflags=subprocess.CREATE_NO_WINDOW).strip()
    pending = sum(row['Version'] != EXPECTED for row in rows)
    passed = pending == 0 and active == 'v' + EXPECTED
    print(json.dumps({'CheckedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'ActiveVersion': active, 'RunningNodeCount': len(rows), 'PendingRestartCount': pending, 'AllRunningPatched': passed, 'Processes': sorted(rows, key=lambda row: row['PID'])}, indent=2))
    return 0 if passed else 2


if __name__ == '__main__':
    sys.exit(main())
