import os
import sys
import subprocess

def fix_com_registry():
    print("⚠️ COM 레지스트리 오류 감지. 자동 복구를 시도합니다...")
    
    paths = [
        r"C:\Program Files (x86)\Hnc\Office 2022\HOffice120\Bin\Hwp.exe",
        r"C:\Program Files (x86)\Hnc\Office 2024 Viewer\HOffice130\Bin\HwpViewer.exe"
    ]
    hwp_path = None
    for p in paths:
        if os.path.exists(p):
            hwp_path = p
            break
            
    if hwp_path:
        print(f"🔧 HWP 경로 발견: {hwp_path}")
        print("🛡️ 관리자 권한으로 레지스트리를 복구합니다. (Windows 보안 확인창에서 '예'를 눌러주세요)")
        cmd = f'powershell -WindowStyle Hidden -Command "Start-Process \'{hwp_path}\' -ArgumentList \'-regserver\' -Verb RunAs -Wait"'
        subprocess.run(cmd, shell=True)
        
        # Clear win32com cache
        import shutil
        cache1 = os.path.expandvars(r"%LOCALAPPDATA%\Temp\gen_py")
        cache2 = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python312\Lib\site-packages\win32com\gen_py")
        if os.path.exists(cache1):
            try: shutil.rmtree(cache1)
            except: pass
        if os.path.exists(cache2):
            try: shutil.rmtree(cache2)
            except: pass
        return True
    else:
        print("❌ Hwp.exe 경로를 찾을 수 없습니다.")
        return False

try:
    from pyhwpx import Hwp
except Exception as e:
    err_str = str(e)
    if "2147319779" in err_str or "등록되지 않았습니다" in err_str:
        if fix_com_registry():
            os.execv(sys.executable, ['python'] + sys.argv)
        else:
            sys.exit(1)
    else:
        print(f"⚠️ 모듈 로딩 중 오류 발생: {e}")
        sys.exit(1)
def hwp_to_pdf(hwp_path):
    if not os.path.exists(hwp_path):
        print("❌ 파일이 존재하지 않습니다.")
        sys.exit(1)

    try:
        # Use pyhwpx to convert to PDF
        hwp = Hwp()
        hwp.open(hwp_path)

        output_path = os.path.splitext(hwp_path)[0] + ".pdf"
        hwp.save_as(output_path)
        print(f"✅ PDF 저장 완료: {output_path}")
        hwp.quit()
        sys.exit(0)

    except Exception as e:
        print("⚠️ 변환 중 오류 발생:", e)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        hwp_file = sys.argv[1]
        hwp_to_pdf(hwp_file)
    else:
        print("ℹ️ 변환할 .hwp 또는 .hwpx 파일을 전달해주세요.")
        sys.exit(1)
