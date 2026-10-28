// Thu cung "3T Pet" (widget Worker 3t-pet, repo meomeo3101/3t-pet) - 2026-10-29: KHONG con nap cung trong index.html,
// chi nap khi ca 2 cap cho phep: co he thong (Admin, cai_dat_he_thong 'bat_pet_3t') VA cai dat ca nhan (users.bat_pet_3t),
// migration 0147. Tat = khong chen the script -> widget khong chay timer/animation, khong goi manifest/anh tu Worker.
const PET_SRC = "https://3t-pet.dichvu3t.workers.dev/widget.js";
const SCRIPT_ID = "three-t-pet-script";

export function petDuocBat(user: { bat_pet_3t: boolean; pet_3t_he_thong: boolean }): boolean {
  return user.pet_3t_he_thong && user.bat_pet_3t;
}

// Bat -> chen the script (1 lan). Tat khi widget da chay -> widget khong co ham huy (setInterval/rAF chay mai), nen tai
// lai trang de dung han; chua nap thi khong lam gi.
export function apDungPet3T(bat: boolean) {
  const daNap = !!document.getElementById(SCRIPT_ID);
  if (bat) {
    if (daNap) {
      (window as unknown as { ThreeTPet?: { show?: () => void } }).ThreeTPet?.show?.();
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = PET_SRC;
    s.async = true;
    document.body.appendChild(s);
  } else if (daNap) {
    window.location.reload();
  }
}
